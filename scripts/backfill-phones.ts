/**
 * Normalize stored Lead.phone to the local Malaysian form (0…), so the
 * displayed number and the tel: link are right. The WhatsApp link is
 * derived at render via waNumber(), so nothing about wa.me is stored.
 *
 *   npx tsx scripts/backfill-phones.ts          # report only
 *   npx tsx scripts/backfill-phones.ts --write  # apply
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** "60173705170" / "173705170" / "017-370 5170" → "0173705170" */
function toLocal(raw: string): string {
  const d = raw.replace(/\D+/g, "");
  if (!d) return "";
  if (d.startsWith("60")) return "0" + d.slice(2);
  if (d.startsWith("0")) return d;
  return "0" + d;
}

async function main() {
  const write = process.argv.includes("--write");
  const leads = await prisma.lead.findMany({
    where: { phone: { not: null } },
    select: { id: true, name: true, phone: true },
  });

  const changes = leads
    .map((l) => ({ ...l, next: toLocal(l.phone ?? "") }))
    .filter((l) => l.next && l.next !== l.phone);

  console.log(`${leads.length} leads with a phone, ${changes.length} need normalizing.`);
  for (const c of changes.slice(0, 20)) {
    console.log(`  #${c.id} ${c.name ?? ""}: ${c.phone} → ${c.next}`);
  }
  if (changes.length > 20) console.log(`  …and ${changes.length - 20} more`);

  if (!write) {
    console.log("\nDry run. Re-run with --write to apply.");
    return;
  }
  for (const c of changes) {
    await prisma.lead.update({ where: { id: c.id }, data: { phone: c.next } });
  }
  console.log(`\nUpdated ${changes.length} leads.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
