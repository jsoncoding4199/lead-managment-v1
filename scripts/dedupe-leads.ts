/**
 * Find leads that share a phone number and, optionally, delete the extras.
 *
 *   npx tsx scripts/dedupe-leads.ts           # report only (safe)
 *   npx tsx scripts/dedupe-leads.ts --write   # delete the losers
 *
 * Keeper rule per phone — the most useful record wins, scored on:
 *   real name (not a blank or a source label like "Ezy"/"Fb")  +1000
 *   live pipeline status (archived/recycled/rejected score 0)  +200..500
 *   assignees x100, remarks x20
 *   tie-break: the older lead, i.e. the original entry.
 * Deletions cascade to that lead's remarks, history and reminders.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalize(raw: string): string {
  const d = raw.replace(/\D+/g, "");
  if (!d) return "";
  if (d.startsWith("60")) return "0" + d.slice(2);
  return d.startsWith("0") ? d : "0" + d;
}

async function main() {
  const write = process.argv.includes("--write");
  const leads = await prisma.lead.findMany({
    where: { phone: { not: null } },
    select: {
      id: true,
      name: true,
      phone: true,
      status: true,
      isOwn: true,
      createdAt: true,
      _count: { select: { assignments: true, remarks: true } },
    },
  });

  const byPhone = new Map<string, typeof leads>();
  for (const l of leads) {
    const key = normalize(l.phone ?? "");
    if (!key) continue;
    byPhone.set(key, [...(byPhone.get(key) ?? []), l]);
  }

  // Placeholder "names" the old composer left behind — a source tag typed
  // into the name box, not a person.
  const JUNK_NAME = /^(ezy|ezy [we]|fb|ws|fl|zack|lead|test|name)$/i;
  const hasRealName = (n: string | null) =>
    !!n && n.trim().length >= 3 && !JUNK_NAME.test(n.trim());

  const statusScore = (s: string) => {
    if (["APPROVED", "RECYCLED", "REJECTED", "SPAM_OR_MISSING"].includes(s)) return 0;
    if (s === "NEW") return 200;
    return 500; // actively being worked
  };

  const score = (l: (typeof leads)[number]) =>
    (hasRealName(l.name) ? 1000 : 0) +
    statusScore(l.status) +
    l._count.assignments * 100 +
    l._count.remarks * 20;

  const doomed: number[] = [];
  let groups = 0;
  for (const [phone, group] of byPhone) {
    if (group.length < 2) continue;
    groups++;
    const ranked = [...group].sort(
      (a, b) => score(b) - score(a) || a.createdAt.getTime() - b.createdAt.getTime()
    );
    const [keep, ...rest] = ranked;
    console.log(`\n${phone}`);
    console.log(`  KEEP   #${keep.id} ${keep.name ?? "(no name)"} [${keep.status}] ` +
      `${keep._count.assignments} assignee(s), ${keep._count.remarks} remark(s)`);
    for (const r of rest) {
      console.log(`  DELETE #${r.id} ${r.name ?? "(no name)"} [${r.status}] ` +
        `${r._count.assignments} assignee(s), ${r._count.remarks} remark(s)`);
      doomed.push(r.id);
    }
  }

  console.log(`\n${groups} duplicated phone number(s), ${doomed.length} lead(s) to remove.`);
  if (!write) {
    console.log("Dry run — nothing deleted. Re-run with --write to apply.");
    return;
  }
  const res = await prisma.lead.deleteMany({ where: { id: { in: doomed } } });
  console.log(`Deleted ${res.count} lead(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
