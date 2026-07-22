"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { X } from "lucide-react";

type UserOption = { id: number; displayName: string };
type SourceOption = { id: number; name: string };
type LocationOption = { id: number; name: string };

type Props = {
  users: UserOption[];
  sources: SourceOption[];
  locations: LocationOption[];
  creatorId: number | null;
  sourceId: number | null;
  locationId: number | null;
};

/**
 * Cross-tab filter bar: narrow the visible leads by who added them
 * (creator) and/or their source. Writes `fu` / `fs` URL params, keeping
 * the current tab + search so the filter applies to whatever tab is open.
 */
export function LeadFilterBar({
  users,
  sources,
  locations,
  creatorId,
  sourceId,
  locationId,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setParam = (key: "fu" | "fs" | "fl", value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
  };

  const clearAll = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("fu");
    next.delete("fs");
    next.delete("fl");
    router.push(`${pathname}?${next.toString()}`);
  };

  const active = creatorId !== null || sourceId !== null || locationId !== null;

  return (
    <div className="flex items-center gap-1.5 rounded-xl bg-white/95 backdrop-blur p-1.5 ring-1 ring-ink-200 shadow-soft">
      <select
        value={creatorId ?? ""}
        onChange={(e) => setParam("fu", e.target.value)}
        className="h-8 min-w-0 flex-1 rounded-md border border-ink-200 bg-white px-1.5 text-xs text-ink-800"
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
        className="h-8 min-w-0 flex-1 rounded-md border border-ink-200 bg-white px-1.5 text-xs text-ink-800"
        aria-label="Filter by source"
      >
        <option value="">All sources</option>
        {sources.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      <select
        value={locationId ?? ""}
        onChange={(e) => setParam("fl", e.target.value)}
        className="h-8 min-w-0 flex-1 rounded-md border border-ink-200 bg-white px-1.5 text-xs text-ink-800"
        aria-label="Filter by location"
      >
        <option value="">All locations</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>

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
