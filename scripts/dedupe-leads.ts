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
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Collected alongside the console output when --out <path> is passed. */
const report: string[] = [];
const say = (line: string) => {
  console.log(line);
  report.push(line);
};

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
      privateChannelUserId: true,
      source: { select: { name: true } },
      createdBy: { select: { displayName: true } },
      assignments: { select: { user: { select: { displayName: true } } } },
      remarks: {
        select: { body: true, author: { select: { displayName: true } } },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { assignments: true, remarks: true } },
    },
    orderBy: { id: "asc" },
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

  const fmt = (l: (typeof leads)[number], tag: string) => {
    const where = l.isOwn
      ? "Own"
      : l.privateChannelUserId
        ? `private channel (user ${l.privateChannelUserId})`
        : "public pipeline";
    say(`  ${tag} #${l.id}  ${l.name ?? "(no name)"}`);
    say(`         status ${l.status} · in ${where} · source ${l.source?.name ?? "—"}`);
    say(
      `         added ${l.createdAt.toISOString().slice(0, 10)} by ${l.createdBy?.displayName ?? "—"}` +
        ` · ${l._count.assignments} assignee(s)` +
        (l.assignments.length
          ? " (" + l.assignments.map((a) => a.user.displayName).join(", ") + ")"
          : "")
    );
    for (const r of l.remarks) {
      const body = r.body.replace(/\s+/g, " ").slice(0, 160);
      say(`         remark by ${r.author.displayName}: ${body}`);
    }
  };

  const doomed: number[] = [];
  let groups = 0;
  let losingRemarks = 0;
  for (const [phone, group] of byPhone) {
    if (group.length < 2) continue;
    groups++;
    const ranked = [...group].sort(
      (a, b) => score(b) - score(a) || a.createdAt.getTime() - b.createdAt.getTime()
    );
    const [keep, ...rest] = ranked;
    say("\n" + "-".repeat(66));
    say(`${groups}. ${phone}`);
    fmt(keep, "KEEP  ");
    for (const r of rest) {
      fmt(r, "DELETE");
      losingRemarks += r._count.remarks;
      doomed.push(r.id);
    }
  }

  say("\n" + "=".repeat(66));
  say(`${groups} duplicated phone number(s), ${doomed.length} lead(s) would be removed.`);
  say(`${losingRemarks} remark(s) would be lost with them.`);
  say(`ids: ${doomed.join(", ")}`);

  const outAt = process.argv.indexOf("--out");
  if (outAt > -1 && process.argv[outAt + 1]) {
    writeFileSync(process.argv[outAt + 1], report.join("\n") + "\n", "utf8");
    console.log(`\nreport written to ${process.argv[outAt + 1]}`);
  }

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
