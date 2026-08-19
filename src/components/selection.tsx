"use client";

import { createContext, useContext, useMemo, useState } from "react";

/**
 * Lead multi-select shared across every list surface (dashboard card lists +
 * the Bulk Edit grid). Mounted only for master, so selection checkboxes and
 * the bulk-move bar never appear for regular users. `useSelection()` returns
 * null when there's no provider — callers render nothing in that case.
 */
type Selection = {
  ids: Set<number>;
  has: (id: number) => boolean;
  toggle: (id: number) => void;
  clear: () => void;
  count: number;
};

const SelectionCtx = createContext<Selection | null>(null);

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<Set<number>>(new Set());
  const value = useMemo<Selection>(
    () => ({
      ids,
      has: (id) => ids.has(id),
      toggle: (id) =>
        setIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
      clear: () => setIds(new Set()),
      count: ids.size,
    }),
    [ids]
  );
  return <SelectionCtx.Provider value={value}>{children}</SelectionCtx.Provider>;
}

export function useSelection(): Selection | null {
  return useContext(SelectionCtx);
}
