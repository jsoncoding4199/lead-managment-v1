import { inflateRawSync } from "zlib";

/**
 * Spreadsheet reader for the lead importer: CSV (Excel's "CSV UTF-8"
 * export) and .xlsx workbooks. Returns a header row + data rows of raw
 * strings; the caller decides what the columns mean.
 *
 * ponytail: hand-rolled instead of pulling in a spreadsheet dependency —
 * we need exactly one sheet of flat text. Reach for a real library if we
 * ever need dates, formulas, multi-sheet, or .xls (the old binary format).
 */
export type Sheet = { headers: string[]; rows: string[][] };

export function parseSheet(fileName: string, bytes: Buffer): Sheet {
  const isXlsx =
    fileName.toLowerCase().endsWith(".xlsx") ||
    // Zip magic — trust the bytes over a filename like "export.csv.xlsx".
    (bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b);
  const table = isXlsx ? readXlsx(bytes) : parseCsv(bytes.toString("utf8"));
  if (table.length === 0) return { headers: [], rows: [] };
  return { headers: table[0].map((h) => h.trim()), rows: table.slice(1) };
}

/* ------------------------------- CSV -------------------------------- */

/**
 * Minimal RFC-4180 reader: quoted fields, embedded commas/newlines, ""
 * escapes, CR/LF/CRLF endings, leading BOM. Blank lines dropped.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") endField();
    else if (c === "\r") {
      if (src[i + 1] === "\n") i++;
      endRow();
    } else if (c === "\n") endRow();
    else field += c;
  }
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

/* ------------------------------- XLSX ------------------------------- */

/** Read a zip's entries via its central directory. Store + deflate only. */
function unzip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  // End-of-central-directory record, scanned from the back (it may be
  // followed by a variable-length comment).
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66_000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a valid .xlsx file.");

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);

    const dataAt = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const raw = buf.subarray(dataAt, dataAt + compSize);
    out.set(name, method === 8 ? inflateRawSync(raw) : Buffer.from(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function xmlText(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");
}

/** "A" → 0, "Z" → 25, "AA" → 26. */
function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function readXlsx(buf: Buffer): string[][] {
  const files = unzip(buf);

  const ssXml = files.get("xl/sharedStrings.xml")?.toString("utf8") ?? "";
  const shared: string[] = [];
  for (const si of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    // A cell's string can be split across several <t> runs (mixed formatting).
    shared.push(
      [...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => xmlText(t[1])).join("")
    );
  }

  const sheetName =
    [...files.keys()].find((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)) ?? "";
  const sheetXml = files.get(sheetName)?.toString("utf8") ?? "";
  if (!sheetXml) throw new Error("The workbook has no sheet to read.");

  const rows: string[][] = [];
  for (const r of sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const c of r[1].matchAll(
      /<c r="([A-Z]+)\d+"([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g
    )) {
      const [, ref, attrs, body = ""] = c;
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      let value = "";
      if (type === "inlineStr") {
        value = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
          .map((t) => xmlText(t[1]))
          .join("");
      } else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "";
        // ponytail: a date cell would arrive as a serial number here. No
        // date columns in the lead exports, so they'd land in the detail
        // body as digits — convert via the style's numFmt if that changes.
        value = type === "s" ? shared[Number(v)] ?? "" : xmlText(v);
      }
      // Sparse rows skip empty cells, so place by column letter.
      const idx = colIndex(ref);
      while (cells.length < idx) cells.push("");
      cells[idx] = value;
    }
    if (cells.some((c) => c.trim() !== "")) rows.push(cells);
  }
  return rows;
}

/* ---------------------------- field helpers -------------------------- */

/** "Phone Number" / "phone_number" / "PhoneNo." → "phonenumber" */
export function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Digits-only form used to compare two phone numbers, with Excel's damage
 * undone: a number column drops the leading zero, so "163026963" comes
 * back as "0163026963". Anything already local (0…) or international
 * (60…) is left alone.
 */
export function normalizePhone(raw: string): string {
  const d = raw.replace(/\D+/g, "");
  if (!d) return "";
  if (d.startsWith("0") || d.startsWith("60")) return d;
  return "0" + d;
}
