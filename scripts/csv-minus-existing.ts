/**
 * Strip rows from a lead CSV whose phone number already exists anywhere in
 * the app — same cross-reference the importer does, run ahead of time so
 * the file you upload contains only genuinely new people.
 *
 *   npx tsx scripts/csv-minus-existing.ts <in.csv> <out.csv> [removed.csv]
 *
 * Reads only; the input file is never modified.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { parseCsv, normalizeHeader, normalizePhone } from "../src/lib/sheet";

const prisma = new PrismaClient();
const [, , IN, OUT, REMOVED] = process.argv;

function toCsv(headers: string[], rows: string[][]): string {
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

async function main() {
  const table = parseCsv(readFileSync(IN, "utf8"));
  if (table.length < 2) throw new Error("No data rows in " + IN);
  const headers = table[0].map((h) => h.trim());
  const rows = table.slice(1);

  const phoneCol = headers.findIndex((h) =>
    ["phonenumber", "phone", "telephonenumber", "contactnumber"].includes(normalizeHeader(h))
  );
  if (phoneCol < 0) throw new Error("No phone column. Headers: " + headers.join(", "));

  const inApp = new Set(
    (await prisma.lead.findMany({ where: { phone: { not: null } }, select: { phone: true } }))
      .map((l) => normalizePhone(l.phone ?? ""))
      .filter(Boolean)
  );

  const keep: string[][] = [];
  const drop: string[][] = [];
  const seenInFile = new Set<string>();
  let dupInFile = 0;
  for (const r of rows) {
    const key = normalizePhone(r[phoneCol] ?? "");
    if (key && inApp.has(key)) {
      drop.push(r);
    } else if (key && seenInFile.has(key)) {
      dupInFile++;
      drop.push(r);
    } else {
      if (key) seenInFile.add(key);
      // Write the phone back in local form. Excel strips the leading zero
      // every time this file is opened and saved, so normalize on the way
      // out rather than trusting whatever round-trip it has been through.
      const out = [...r];
      if (key) out[phoneCol] = key;
      keep.push(out);
    }
  }

  writeFileSync(OUT, "﻿" + toCsv(headers, keep), "utf8");
  if (REMOVED) writeFileSync(REMOVED, "﻿" + toCsv(headers, drop), "utf8");

  console.log(`leads in app        : ${inApp.size}`);
  console.log(`rows in file        : ${rows.length}`);
  console.log(`removed (in app)    : ${drop.length - dupInFile}`);
  console.log(`removed (dup in file): ${dupInFile}`);
  console.log(`rows kept           : ${keep.length}  ->  ${OUT}`);
  if (REMOVED) console.log(`removed rows written ->  ${REMOVED}`);
  console.log("\nsample removed:");
  for (const r of drop.slice(0, 10)) console.log("   ", r.join(" | "));
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
