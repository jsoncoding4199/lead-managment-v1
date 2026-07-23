"use client";

import { useRef, useState, useTransition } from "react";
import { Upload, Loader2, Check, AlertTriangle, ChevronDown } from "lucide-react";
import { importOwnLeadsAction, type ImportResult } from "@/app/dashboard/actions";

/**
 * Bulk import into the master's Own list. Collapsed to a slim bar until
 * tapped, like the composer above it. Imported leads get no reminder —
 * a 400-row file would otherwise fire 400 pushes an hour later.
 */
export function OwnLeadImport({ sources }: { sources: { id: number; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState(
    sources.find((s) => s.name.toLowerCase() === "ezy")?.name ?? ""
  );
  const [result, setResult] = useState<ImportResult | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file || pending) return;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("sourceName", sourceName);
    setResult(null);
    startTransition(async () => {
      const res = await importOwnLeadsAction(fd);
      setResult(res);
      if (!res.error) {
        setFileName(null);
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="card flex h-full w-full items-center gap-2.5 p-2.5 md:p-4 text-left hover:bg-ink-50"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
          <Upload className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-ink-900">Import from Excel</span>
          <span className="hidden md:block text-xs text-ink-500">
            Upload a .csv or .xlsx — one row per lead.
          </span>
        </span>
      </button>
    );
  }

  return (
    // col-span-2 so expanding takes the full row of the Own tab's 2-up grid.
    <form onSubmit={submit} className="card col-span-2 p-3.5 md:p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink-900">Import from Excel</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn btn-ghost h-8 text-xs"
        >
          Close
        </button>
      </div>

      <p className="text-xs text-ink-500">
        Headers on row 1. <strong>Name</strong> and <strong>Phone Number</strong> become the
        lead&apos;s contact rows, <strong>Location</strong> its pill — every other column is kept
        in the lead details. Leading zeros Excel dropped from phone numbers are restored, and
        numbers already in your Own list are skipped.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="btn btn-outline h-9 cursor-pointer text-xs">
          Choose file
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              setFileName(e.target.files?.[0]?.name ?? null);
              setResult(null);
            }}
          />
        </label>
        <span className="min-w-0 flex-1 truncate text-xs text-ink-600">
          {fileName ?? "No file chosen"}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <label className="label mb-0 shrink-0">Source</label>
        <select
          value={sourceName}
          onChange={(e) => setSourceName(e.target.value)}
          className="input h-9 flex-1 text-sm"
        >
          <option value="">No source</option>
          {sources.map((s) => (
            <option key={s.id} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={pending || !fileName}
        className="btn btn-primary h-10 w-full text-sm"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {pending ? "Importing…" : "Import into Own"}
      </button>

      {result?.error && (
        <p className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {result.error}
        </p>
      )}

      {result && !result.error && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <p className="flex items-center gap-2 font-semibold">
            <Check className="h-3.5 w-3.5" />
            {result.imported} lead{result.imported === 1 ? "" : "s"} imported
          </p>
          {(result.skippedInvalid ?? 0) > 0 && (
            <p className="mt-1">{result.skippedInvalid} row(s) skipped — no name or phone.</p>
          )}
          {(result.skippedDuplicates?.length ?? 0) > 0 && (
            <div className="mt-1">
              <button
                type="button"
                onClick={() => setShowSkipped((v) => !v)}
                className="inline-flex items-center gap-1 font-medium underline"
              >
                {result.skippedDuplicates!.length} skipped as duplicate phone
                <ChevronDown
                  className={"h-3 w-3 transition-transform " + (showSkipped ? "rotate-180" : "")}
                />
              </button>
              {showSkipped && (
                <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
                  {result.skippedDuplicates!.map((d) => (
                    <li key={d} className="truncate">
                      {d}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <p className="mt-1 text-emerald-700">
            No reminders were set — use the Remind button per lead.
          </p>
        </div>
      )}
    </form>
  );
}
