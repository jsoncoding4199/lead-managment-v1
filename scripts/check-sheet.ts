/**
 * Self-check for the lead-import parser. Run:
 *   npx tsx scripts/check-sheet.ts [path-to-a-real-export]
 * The CSV/phone assertions run always; pass a file to also dry-run a real
 * spreadsheet (nothing is written to the database either way).
 */
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { parseCsv, parseSheet, normalizePhone, normalizeHeader } from "../src/lib/sheet";
import { waNumber } from "../src/lib/utils";

// Quoted fields, embedded comma + newline + "" escape, CRLF endings.
const csv = 'Name,Phone Number,Note\r\n"Tan, Ah Kow",0123456789,"said ""ok""\nlater"\r\n';
const rows = parseCsv(csv);
assert.deepStrictEqual(rows[0], ["Name", "Phone Number", "Note"]);
assert.deepStrictEqual(rows[1], ["Tan, Ah Kow", "0123456789", 'said "ok"\nlater']);
assert.strictEqual(rows.length, 2, "blank trailing line should be dropped");

// Excel eats the leading zero on a numeric phone column; put it back.
assert.strictEqual(normalizePhone("163026963"), "0163026963");
assert.strictEqual(normalizePhone("1115117620"), "01115117620");
assert.strictEqual(normalizePhone("0123456789"), "0123456789");
assert.strictEqual(normalizePhone("60123456789"), "60123456789");
assert.strictEqual(normalizePhone("012-345 6789"), "0123456789");
assert.strictEqual(normalizePhone(""), "");

// wa.me needs the country code; display and tel: stay local.
assert.strictEqual(waNumber("0173705170"), "60173705170");
assert.strictEqual(waNumber("173705170"), "60173705170");
assert.strictEqual(waNumber("+60 17-370 5170"), "60173705170");
assert.strictEqual(waNumber("60173705170"), "60173705170");
assert.strictEqual(waNumber(""), "");

assert.strictEqual(normalizeHeader("Phone Number"), "phonenumber");
assert.strictEqual(normalizeHeader("Loan Amount (MYR)"), "loanamountmyr");

const path = process.argv[2];
if (path) {
  const sheet = parseSheet(path, readFileSync(path));
  console.log("headers:", sheet.headers);
  console.log("rows:", sheet.rows.length);
  console.log("first row:", sheet.rows[0]);
  const phones = sheet.rows.map((r) => normalizePhone(r[sheet.headers.findIndex(
    (h) => normalizeHeader(h) === "phonenumber"
  )] ?? ""));
  console.log("sample phones:", phones.slice(0, 5));
  console.log("blank phones:", phones.filter((p) => !p).length);
  console.log("dupe phones:", phones.length - new Set(phones).size);
  assert.ok(sheet.rows.length > 0, "no data rows parsed");
  assert.ok(sheet.headers.length > 1, "headers not parsed");
}

console.log("sheet parser OK");
