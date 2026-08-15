"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { X, ArrowDownWideNarrow, ChevronDown, Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const AGE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Any age" },
  { value: "1_14", label: "1–14 days" },
  { value: "15_29", label: "15–29 days" },
  { value: "30_59", label: "30–59 days" },
  { value: "60_89", label: "60–89 days" },
  { value: "90_up", label: "90+ days" },
];

type Option = { id: number; label: string };
type UserOption = { id: number; displayName: string };
type NamedOption = { id: number; name: string };

type Props = {
  users: UserOption[];
  sources: NamedOption[];
  locations: NamedOption[];
  creatorIds: number[];
  sourceIds: number[];
  locationIds: number[];
  age: string | null;
  sort: "new" | "old";
};

/**
 * Cross-tab filter bar. Each dimension (user / source / location) is a
 * multi-select dropdown — pick several and leads matching ANY of them in
 * that dimension show. Selections are written to fu / fs / fl as
 * comma-separated id lists, keeping the current tab + search + sort.
 */
export function LeadFilterBar({
  users,
  sources,
  locations,
  creatorIds,
  sourceIds,
  locationIds,
  age,
  sort,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setList = (key: "fu" | "fs" | "fl", ids: number[]) => {
    const next = new URLSearchParams(params.toString());
    if (ids.length) next.set(key, ids.join(","));
    else next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
  };

  const setAge = (value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set("age", value);
    else next.delete("age");
    router.push(`${pathname}?${next.toString()}`);
  };

  const setSort = (value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value === "old") next.set("sort", "old");
    else next.delete("sort");
    router.push(`${pathname}?${next.toString()}`);
  };

  const clearAll = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("fu");
    next.delete("fs");
    next.delete("fl");
    next.delete("age");
    router.push(`${pathname}?${next.toString()}`);
  };

  const active =
    creatorIds.length > 0 || sourceIds.length > 0 || locationIds.length > 0 || !!age;

  return (
    <div className="flex items-center gap-1.5 rounded-xl bg-white/95 backdrop-blur p-1.5 ring-1 ring-ink-200 shadow-soft">
      <MultiSelect
        label="Users"
        options={users.map((u) => ({ id: u.id, label: u.displayName }))}
        selected={creatorIds}
        onChange={(ids) => setList("fu", ids)}
      />
      <MultiSelect
        label="Sources"
        options={sources.map((s) => ({ id: s.id, label: s.name }))}
        selected={sourceIds}
        onChange={(ids) => setList("fs", ids)}
      />
      <MultiSelect
        label="Locations"
        options={locations.map((l) => ({ id: l.id, label: l.name }))}
        selected={locationIds}
        onChange={(ids) => setList("fl", ids)}
      />

      <span
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1 rounded-md border pl-1.5",
          age ? "border-brand-300 bg-brand-50" : "border-ink-200 bg-white"
        )}
      >
        <Clock className={cn("h-3.5 w-3.5 shrink-0", age ? "text-brand-500" : "text-ink-400")} />
        <select
          value={age ?? ""}
          onChange={(e) => setAge(e.target.value)}
          className={cn(
            "h-8 min-w-0 flex-1 bg-transparent pr-1 text-xs",
            age ? "text-brand-800" : "text-ink-800"
          )}
          aria-label="Filter by lead age"
        >
          {AGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </span>

      <span className="flex min-w-0 flex-1 items-center gap-1 rounded-md border border-ink-200 bg-white pl-1.5">
        <ArrowDownWideNarrow className="h-3.5 w-3.5 shrink-0 text-ink-400" />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="h-8 min-w-0 flex-1 bg-transparent pr-1 text-xs text-ink-800"
          aria-label="Sort by date"
        >
          <option value="new">Newest</option>
          <option value="old">Oldest</option>
        </select>
      </span>

      {active && (
        <button
          type="button"
          onClick={clearAll}
          aria-label="Clear filters"
          title="Clear filters"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-500 hover:bg-ink-100 hover:text-ink-700"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Checkbox dropdown for one filter dimension. Closes on outside click. */
function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Option[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => setPortalNode(document.body), []);

  // Position the menu under the button in viewport coordinates (it renders
  // in a body portal so it can never be clipped or painted under the lead
  // list). Reposition on scroll/resize while open.
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = 208; // ~w-52
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      setPos({ top: r.bottom + 4, left });
    };
    place();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selectedSet = new Set(selected);
  const toggle = (id: number) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  const count = selected.length;

  return (
    <div className="relative min-w-0 flex-1">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex h-8 w-full items-center gap-1 rounded-md border px-1.5 text-xs",
          count > 0
            ? "border-brand-300 bg-brand-50 text-brand-800"
            : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
        )}
      >
        <span className="truncate">{label}</span>
        {count > 0 && (
          <span className="grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white tabular-nums">
            {count}
          </span>
        )}
        <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-ink-400" />
      </button>

      {open && portalNode && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: 208 }}
          className="z-[120] max-h-64 max-w-[80vw] overflow-y-auto rounded-lg border border-ink-200 bg-white p-1 shadow-lift"
        >
          {options.length === 0 ? (
            <div className="px-2 py-2 text-xs text-ink-400">Nothing to filter by.</div>
          ) : (
            <>
              {count > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="mb-1 w-full rounded-md px-2 py-1 text-left text-[11px] font-medium text-rose-600 hover:bg-rose-50"
                >
                  Clear {label.toLowerCase()}
                </button>
              )}
              {options.map((o) => {
                const on = selectedSet.has(o.id);
                return (
                  <button
                    type="button"
                    key={o.id}
                    onClick={() => toggle(o.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-ink-800 hover:bg-ink-50"
                  >
                    <span
                      className={cn(
                        "grid h-4 w-4 shrink-0 place-items-center rounded border",
                        on ? "border-brand-500 bg-brand-500 text-white" : "border-ink-300 bg-white"
                      )}
                    >
                      {on && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate">{o.label}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>,
        portalNode
      )}
    </div>
  );
}
