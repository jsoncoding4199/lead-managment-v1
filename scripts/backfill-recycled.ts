// One-off: sweep any RECYCLED lead still stuck in a private pipeline into
// the shared Archive. Clears privateChannelUserId + all assignments.
//
// Run: npx tsx scripts/backfill-recycled.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const stuck = await prisma.lead.findMany({
    where: { status: "RECYCLED", privateChannelUserId: { not: null } },
    select: { id: true, privateChannelUserId: true },
  });

  if (stuck.length === 0) {
    console.log("Nothing to backfill.");
    return;
  }

  console.log(`Found ${stuck.length} stuck RECYCLED lead(s):`, stuck.map((l) => l.id));

  const ids = stuck.map((l) => l.id);
  await prisma.$transaction([
    prisma.leadAssignment.deleteMany({ where: { leadId: { in: ids } } }),
    prisma.lead.updateMany({
      where: { id: { in: ids } },
      data: { privateChannelUserId: null },
    }),
  ]);

  console.log(`Backfilled ${stuck.length} lead(s) into Archive.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
