/**
 * Backfill / repair lead names + phones from the pasted `content`.
 *
 * Handles both paste shapes:
 *   1. "Name: Jane Doe"        — label + separator + value on one line
 *   2. "Name\nmuhammad fadzrin" — label alone, value on the next line
 *      (Gmail form exports)
 * Fallback: first non-empty non-label line.
 *
 * Also repairs earlier backfill artifacts where `name` was set to a
 * literal label word like "Name". Idempotent — reruns only touch leads
 * whose name is null/artifact (and phones only when phone is null).
 *
 * Run: npx tsx scripts/backfill-lead-names.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const NAME_LABELS = ["name", "nama", "full name", "customer"];
const PHONE_LABELS = [
  "phone",
  "phone number",
  "tel",
  "mobile",
  "hp",
  "no telefon",
  "no",
  "contact",
];
const ALL_LABELS = new Set(
  [
    ...NAME_LABELS,
    ...PHONE_LABELS,
    "email",
    "employment type",
    "job title",
    "loan amount (myr)",
    "loan amount",
    "salary amount (myr)",
    "salary amount",
    "salary",
    "ic",
    "nric",
  ].map((l) => l.toLowerCase())
);

function parseContact(text: string): { name: string | null; phone: string | null } {
  const lines = text.split(/\r?\n/).map((l) => l.trim());

  const sameLine = (labels: string[]) => {
    const re = new RegExp(
      `^\\s*(?:${labels.join("|")})\\s*[:：\\-]\\s*(.+?)\\s*$`,
      "im"
    );
    return text.match(re)?.[1]?.trim();
  };
  const nextLine = (labels: string[]) => {
    const wanted = labels.map((l) => l.toLowerCase());
    for (let i = 0; i < lines.length - 1; i++) {
      if (!wanted.includes(lines[i].toLowerCase())) continue;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j]) return lines[j];
      }
    }
    return undefined;
  };
  const firstLineName = (() => {
    for (const s of lines) {
      if (!s) continue;
      if (ALL_LABELS.has(s.toLowerCase())) continue;
      if (s.length > 60) return undefined;
      if (/@/.test(s)) return undefined;
      if (/^\+?\d[\d\s\-()]{5,}$/.test(s)) return undefined;
      if (/[:：]/.test(s)) return undefined;
      return s;
    }
    return undefined;
  })();

  const name =
    sameLine(NAME_LABELS) ?? nextLine(NAME_LABELS) ?? firstLineName ?? null;
  const phone =
    sameLine(PHONE_LABELS) ??
    nextLine(PHONE_LABELS) ??
    text.match(/(?:\+?60|0)[\s-]?\d{1,2}[\s-]?\d{3,4}[\s-]?\d{4}/)?.[0] ??
    null;
  return {
    name: name ? name.slice(0, 200) : null,
    phone: phone && /\d{6,}/.test(phone.replace(/\D+/g, "")) ? phone.slice(0, 50) : null,
  };
}

async function main() {
  // Artifact names produced by the earlier first-line heuristic when the
  // paste started with a bare label line.
  const artifacts = ["Name", "Phone Number", "Email", "Customer", "Nama"];

  const candidates = await prisma.lead.findMany({
    where: {
      OR: [{ name: null }, { name: { in: artifacts } }, { phone: null }],
    },
    select: { id: true, content: true, name: true, phone: true },
  });

  if (candidates.length === 0) {
    console.log("Nothing to backfill.");
    return;
  }

  console.log(`Scanning ${candidates.length} lead(s)…`);

  let nameFixed = 0;
  let phoneFixed = 0;
  for (const lead of candidates) {
    const parsed = parseContact(lead.content);
    const data: { name?: string; phone?: string } = {};
    const nameIsArtifact = lead.name !== null && artifacts.includes(lead.name);
    if ((lead.name === null || nameIsArtifact) && parsed.name && !artifacts.includes(parsed.name)) {
      data.name = parsed.name;
    }
    if (lead.phone === null && parsed.phone) {
      data.phone = parsed.phone;
    }
    if (Object.keys(data).length === 0) continue;
    try {
      await prisma.lead.update({ where: { id: lead.id }, data });
      if (data.name) nameFixed++;
      if (data.phone) phoneFixed++;
    } catch (err) {
      console.error(`Failed to update lead ${lead.id}:`, err);
    }
  }

  console.log(`Names set/repaired: ${nameFixed}. Phones filled: ${phoneFixed}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
