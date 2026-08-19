"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";
import type { LeadStatus } from "@prisma/client";
import { STATUS_LABEL } from "@/lib/leadStatus";
import { cn } from "@/lib/utils";
import { useSelection } from "./selection";
import {
  setLeadNameAction,
  setLeadPhoneAction,
  setLeadSourceAction,
  setLeadLocationAction,
  changeStatusAction,
  addLeadRemarkAction,
  deleteLeadAction,
} from "@/app/dashboard/actions";

export type SheetRow = {
  id: number;
  name: string | null;
  phone: string | null;
  status: LeadStatus;
  sourceId: number | null;
  locationId: number | null;
  /** Where the lead currently sits: a private-channel user's name, "Own", or "Public". */
  placement: string;
};

type Named = { id: number; name: string };

// Reject / Recycle both require a written reason (enforced server-side and,
// for Recycle, a required remark) — those stay on the lead card where the
// prompt lives. The grid offers every other status.
const SHEET_STATUSES: LeadStatus[] = [
  "NEW",
  "CONTACT_ABLE",
  "CONTACT_NOT_ABLE",
  "DOCUMENTS_ABLE",
  "DOCUMENTS_NOT_ABLE",
  "APPOINTMENT_ABLE",
  "APPOINTMENT_NOT_ABLE",
  "SPAM_OR_MISSING",
  "APPROVED",
];

type SaveState = "saving" | "saved" | "error";

type HeaderFilters = { status: string; source: string; location: string; under: string };

export function LeadSheet({
  rows,
  sources,
  locations,
  users,
  filters,
}: {
  rows: SheetRow[];
  sources: Named[];
  locations: Named[];
  users: { id: number; displayName: string }[];
  filters: HeaderFilters;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // Header column filters navigate by URL param; the server re-queries. Reset
  // to page 1 on any filter change so you don't land past the last page.
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("p");
    router.push(`${pathname}?${next.toString()}`);
  };
  // Source filter is special: "none" means "leads with no source" (`nos=1`,
  // clears the id filter); an id means that source (`fs`, clears nos).
  const setSourceFilter = (value: string) => {
    const next = new URLSearchParams(params.toString());
    next.delete("p");
    if (value === "none") {
      next.set("nos", "1");
      next.delete("fs");
    } else if (value) {
      next.set("fs", value);
      next.delete("nos");
    } else {
      next.delete("fs");
      next.delete("nos");
    }
    router.push(`${pathname}?${next.toString()}`);
  };

  const sel = useSelection();
  const [, startTransition] = useTransition();
  const [state, setState] = useState<Record<number, { s: SaveState; msg?: string }>>({});
  // Rows deleted this session — hidden immediately so the grid reflects the
  // delete without a full reload.
  const [removed, setRemoved] = useState<Set<number>>(new Set());

  const del = (id: number) => {
    if (!window.confirm(`Delete lead #${id}? This removes it from wherever it lives and can't be undone.`)) return;
    setState((m) => ({ ...m, [id]: { s: "saving" } }));
    startTransition(async () => {
      const f = new FormData();
      f.set("leadId", String(id));
      const res = await deleteLeadAction(f);
      if (res?.error) {
        setState((m) => ({ ...m, [id]: { s: "error", msg: res.error } }));
      } else {
        setRemoved((prev) => new Set(prev).add(id));
      }
    });
  };
  // Last value we persisted per cell, so an onBlur that didn't actually change
  // anything doesn't fire a redundant write.
  const lastSaved = useRef<Record<string, string>>({});

  const save = (id: number, key: string, value: string, run: () => Promise<{ error?: string } | void>) => {
    if (lastSaved.current[`${id}:${key}`] === value) return;
    lastSaved.current[`${id}:${key}`] = value;
    setState((m) => ({ ...m, [id]: { s: "saving" } }));
    startTransition(async () => {
      const res = await run();
      setState((m) => ({
        ...m,
        [id]: res?.error ? { s: "error", msg: res.error } : { s: "saved" },
      }));
    });
  };

  const fd = (entries: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(entries)) f.set(k, v);
    return f;
  };

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[880px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink-200 bg-ink-50 text-left text-[11px] uppercase tracking-wide text-ink-500">
            {sel && <th className="px-2 py-2 font-semibold" />}
            <th className="sticky left-0 z-10 bg-ink-50 px-2 py-2 font-semibold">#</th>
            <th className="px-2 py-2 font-semibold">Name</th>
            <th className="px-2 py-2 font-semibold">Phone</th>
            <th className="px-2 py-2 font-semibold">Status</th>
            <th className="px-2 py-2 font-semibold">Source</th>
            <th className="px-2 py-2 font-semibold">Location</th>
            <th className="px-2 py-2 font-semibold">Add remark</th>
            <th className="px-2 py-2 font-semibold">Under</th>
            <th className="px-2 py-2 font-semibold">Saved</th>
            <th className="px-2 py-2 font-semibold">Del</th>
          </tr>
          {/* Per-column filter row — pick a value to narrow the grid. */}
          <tr className="border-b border-ink-200 bg-white">
            {sel && <th className="px-2 py-1" />}
            <th className="sticky left-0 z-10 bg-white px-2 py-1" />
            <th className="px-1 py-1" />
            <th className="px-1 py-1" />
            <th className="px-1 py-1">
              <select
                value={filters.status}
                onChange={(e) => setParam("st", e.target.value)}
                className="input h-7 w-full min-w-[130px] px-1.5 py-0.5 text-xs"
                aria-label="Filter by status"
              >
                <option value="">All statuses</option>
                {(Object.keys(STATUS_LABEL) as LeadStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </th>
            <th className="px-1 py-1">
              <select
                value={filters.source}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="input h-7 w-full min-w-[110px] px-1.5 py-0.5 text-xs"
                aria-label="Filter by source"
              >
                <option value="">All sources</option>
                <option value="none">(No source)</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </th>
            <th className="px-1 py-1">
              <select
                value={filters.location}
                onChange={(e) => setParam("fl", e.target.value)}
                className="input h-7 w-full min-w-[110px] px-1.5 py-0.5 text-xs"
                aria-label="Filter by location"
              >
                <option value="">All locations</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </th>
            <th className="px-1 py-1" />
            <th className="px-1 py-1">
              <select
                value={filters.under}
                onChange={(e) => setParam("ch", e.target.value)}
                className="input h-7 w-full min-w-[110px] px-1.5 py-0.5 text-xs"
                aria-label="Filter by placement"
              >
                <option value="">All</option>
                <option value="public">Public</option>
                <option value="own">Own</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.displayName}</option>
                ))}
              </select>
            </th>
            <th className="px-1 py-1" />
            <th className="px-1 py-1" />
          </tr>
        </thead>
        <tbody>
          {rows.filter((r) => !removed.has(r.id)).length === 0 && (
            <tr>
              <td colSpan={sel ? 11 : 10} className="px-3 py-8 text-center text-sm text-ink-500">
                No leads match these filters.
              </td>
            </tr>
          )}
          {rows.map((r) => {
            if (removed.has(r.id)) return null;
            const st = state[r.id];
            return (
              <tr key={r.id} className={cn("border-b border-ink-100 last:border-0 align-top", sel?.has(r.id) && "bg-brand-50")}>
                {sel && (
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={sel.has(r.id)}
                      onChange={() => sel.toggle(r.id)}
                      aria-label={`Select lead ${r.id}`}
                      className="h-4 w-4 cursor-pointer accent-brand-600"
                    />
                  </td>
                )}
                <td className="sticky left-0 z-10 bg-white px-2 py-1.5 tabular-nums text-ink-400">
                  {r.id}
                </td>
                <td className="px-1 py-1">
                  <input
                    defaultValue={r.name ?? ""}
                    onBlur={(e) =>
                      save(r.id, "name", e.target.value.trim(), () =>
                        setLeadNameAction(fd({ leadId: String(r.id), name: e.target.value.trim() }))
                      )
                    }
                    className="input h-8 min-w-[120px] px-2 py-1"
                    placeholder="—"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    defaultValue={r.phone ?? ""}
                    onBlur={(e) =>
                      save(r.id, "phone", e.target.value.trim(), () =>
                        setLeadPhoneAction(fd({ leadId: String(r.id), phone: e.target.value.trim() }))
                      )
                    }
                    className="input h-8 min-w-[120px] px-2 py-1"
                    placeholder="—"
                  />
                </td>
                <td className="px-1 py-1">
                  <select
                    defaultValue={r.status}
                    onChange={(e) =>
                      save(r.id, "status", e.target.value, () =>
                        changeStatusAction(fd({ leadId: String(r.id), status: e.target.value }))
                      )
                    }
                    className="input h-8 min-w-[150px] px-2 py-1"
                  >
                    {/* If the lead is currently Rejected/Recycled, show it as a
                        read-only current value so the select isn't misleading. */}
                    {!SHEET_STATUSES.includes(r.status) && (
                      <option value={r.status}>{STATUS_LABEL[r.status]}</option>
                    )}
                    {SHEET_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <select
                    defaultValue={r.sourceId ?? 0}
                    onChange={(e) =>
                      save(r.id, "source", e.target.value, () =>
                        setLeadSourceAction(fd({ leadId: String(r.id), sourceId: e.target.value }))
                      )
                    }
                    className="input h-8 min-w-[120px] px-2 py-1"
                  >
                    <option value={0}>—</option>
                    {sources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <select
                    defaultValue={r.locationId ?? 0}
                    onChange={(e) =>
                      save(r.id, "location", e.target.value, () =>
                        setLeadLocationAction(fd({ leadId: String(r.id), locationId: e.target.value }))
                      )
                    }
                    className="input h-8 min-w-[120px] px-2 py-1"
                  >
                    <option value={0}>—</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <input
                    placeholder="Add note + Enter"
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      const el = e.currentTarget;
                      const body = el.value.trim();
                      if (!body) return;
                      // Force a write (remarks append) regardless of lastSaved.
                      lastSaved.current[`${r.id}:remark`] = ` ${Date.now()}`;
                      save(r.id, "remark", body, () =>
                        addLeadRemarkAction(fd({ leadId: String(r.id), body }))
                      );
                      el.value = "";
                    }}
                    className="input h-8 min-w-[160px] px-2 py-1"
                  />
                </td>
                <td className="px-2 py-1.5 text-xs text-ink-500 whitespace-nowrap">{r.placement}</td>
                <td className="px-2 py-1.5 text-xs whitespace-nowrap">
                  {st?.s === "saving" && <span className="text-ink-400">saving…</span>}
                  {st?.s === "saved" && <span className="text-emerald-600">saved ✓</span>}
                  {st?.s === "error" && (
                    <span className="text-rose-600" title={st.msg}>⚠ {st.msg ?? "error"}</span>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => del(r.id)}
                    aria-label={`Delete lead ${r.id}`}
                    title="Delete lead"
                    className="grid h-7 w-7 place-items-center rounded-md text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
