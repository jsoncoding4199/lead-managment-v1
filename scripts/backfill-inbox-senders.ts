/**
 * One-off: leads sent to the master's inbox before the sender was
 * recorded have privateChannelUserId = master.id but no master assignment,
 * so the categorized inbox lumps them under "Own pick up". Recover the
 * sender from the "[Reassigned to Master (private inbox)]" handover remark
 * and create a master assignment stamped with that sender.
 *
 * Idempotent — skips leads that already have a master assignment.
 *
 * Run: npx tsx scripts/backfill-inbox-senders.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [master] = await prisma.user.findMany({
    where: { role: "MASTER" },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (!master) {
    console.log("No master configured.");
    return;
  }

  const leads = await prisma.lead.findMany({
    where: {
      privateChannelUserId: master.id,
      isOwn: false,
      assignments: { none: { userId: master.id } },
    },
    select: {
      id: true,
      remarks: {
        where: { body: { startsWith: "[Reassigned to Master" } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { authorId: true, author: { select: { displayName: true } } },
      },
    },
  });

  if (leads.length === 0) {
    console.log("Nothing to backfill.");
    return;
  }

  let done = 0;
  let skipped = 0;
  for (const lead of leads) {
    const sender = lead.remarks[0];
    if (!sender) {
      skipped++;
      continue;
    }
    try {
      await prisma.leadAssignment.create({
        data: {
          leadId: lead.id,
          userId: master.id,
          assignedById: sender.authorId,
        },
      });
      done++;
      console.log(`Lead #${lead.id} → assigned by ${sender.author.displayName}`);
    } catch (err) {
      console.error(`Failed on lead ${lead.id}:`, err);
    }
  }

  console.log(`Backfilled ${done} lead(s). Skipped ${skipped} (no reassign remark).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
