/**
 * One-off backfill: for every lead where `name` is null, detect the name
 * from the free-text `content` using the same heuristic the composer runs
 * on paste (labelled "Name: ..." line first, then first non-empty line).
 *
 * Idempotent — reruns skip leads that already have a name.
 *
 * Run: npx tsx scripts/backfill-lead-names.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseName(text: string): string | null {
  // 1) Labelled line — Name / Nama / Full name / Customer + separator + value
  const labelRe =
    /^\s*(?:name|nama|full name|customer)\s*[:：\-]\s*(.+?)\s*$/im;
  const labelled = text.match(labelRe)?.[1]?.trim();
  if (labelled) return labelled.slice(0, 200);

  // 2) First non-empty line, skipping email addresses, phone-shaped strings,
  //    lines with colons (likely other labels), and anything unreasonably long.
  for (const raw of text.split(/\r?\n/)) {
    const s = raw.trim();
    if (!s) continue;
    if (s.length > 60) return null;
    if (/@/.test(s)) return null;
    if (/^\+?\d[\d\s\-()]{5,}$/.test(s)) return null;
    if (/[:：]/.test(s)) return null;
    return s.slice(0, 200);
  }
  return null;
}

async function main() {
  const missing = await prisma.lead.findMany({
    where: { name: null },
    select: { id: true, content: true },
  });

  if (missing.length === 0) {
    console.log("No leads need backfilling. Nothing to do.");
    return;
  }

  console.log(`Scanning ${missing.length} lead(s)…`);

  const updates: { id: number; name: string }[] = [];
  for (const lead of missing) {
    const name = parseName(lead.content);
    if (name) updates.push({ id: lead.id, name });
  }

  console.log(`Detected a name in ${updates.length} lead(s).`);

  let ok = 0;
  for (const u of updates) {
    try {
      await prisma.lead.update({
        where: { id: u.id },
        data: { name: u.name },
      });
      ok++;
    } catch (err) {
      console.error(`Failed to update lead ${u.id}:`, err);
    }
  }

  console.log(`Backfilled ${ok} lead(s).`);
  if (updates.length !== missing.length) {
    console.log(
      `Skipped ${missing.length - updates.length} lead(s) where no name could be parsed.`
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
