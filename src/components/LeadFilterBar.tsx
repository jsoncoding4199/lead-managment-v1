"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Filter, X } from "lucide-react";

type UserOption = { id: number; displayName: string };
type SourceOption = { id: number; name: string };

type Props = {
  users: UserOption[];
  sources: SourceOption[];
  creatorId: number | null;
  sourceId: number | null;
};

/**
 * Cross-tab filter bar: narrow the visible leads by who added them
 * (creator) and/or their source. Writes `fu` / `fs` URL params, keeping
 * the current tab + search so the filter applies to whatever tab is open.
 */
export function LeadFilterBar({ users, sources, creatorId, sourceId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setParam = (key: "fu" | "fs", value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
  };

  const clearAll = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("fu");
    next.delete("fs");
    router.push(`${pathname}?${next.toString()}`);
  };

  const active = creatorId !== null || sourceId !== null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white/95 backdrop-blur p-2 ring-1 ring-ink-200 shadow-soft">
      <span className="inline-flex items-center gap-1.5 px-1.5 text-xs font-semibold text-ink-500">
        <Filter className="h-4 w-4" />
        Filter
      </span>

      <select
        value={creatorId ?? ""}
        onChange={(e) => setParam("fu", e.target.value)}
        className="h-9 rounded-md border border-ink-200 bg-white px-2 text-xs text-ink-800"
        aria-label="Filter by user"
      >
        <option value="">All users</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.displayName}
          </option>
        ))}
      </select>

      <select
        value={sourceId ?? ""}
        onChange={(e) => setParam("fs", e.target.value)}
        className="h-9 rounded-md border border-ink-200 bg-white px-2 text-xs text-ink-800"
        aria-label="Filter by source"
      >
        <option value="">All sources</option>
        {sources.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      {active && (
        <button
          type="button"
          onClick={clearAll}
          className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-ink-500 hover:bg-ink-100 hover:text-ink-700"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </button>
      )}
    </div>
  );
}
