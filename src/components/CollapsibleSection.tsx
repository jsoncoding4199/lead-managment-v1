"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A section whose body collapses when the header is clicked.
 *
 * Open/closed state is persisted in localStorage under `storageKey` so the
 * user's preferences survive a page reload. Default state on first paint is
 * controlled by `defaultOpen`.
 */
type Props = {
  storageKey: string;
  defaultOpen?: boolean;
  header: React.ReactNode;
  children: React.ReactNode;
  count?: number;
};

export function CollapsibleSection({
  storageKey,
  defaultOpen = true,
  header,
  children,
  count,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(storageKey);
      if (v === "0") setOpen(false);
      else if (v === "1") setOpen(true);
    } catch {
      /* ignore quota / privacy mode errors */
    }
  }, [storageKey]);

  const toggle = () => {
    setOpen((cur) => {
      const next = !cur;
      try {
        window.localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <section className="space-y-4">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={`section-${storageKey}`}
        className="w-full flex items-center gap-3 text-left rounded-lg hover:bg-ink-100/50 transition-colors px-1 py-1 -mx-1"
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 text-ink-500 transition-transform shrink-0",
            open ? "rotate-0" : "-rotate-90"
          )}
        />
        <div className="flex-1 min-w-0">{header}</div>
        {typeof count === "number" && (
          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold text-ink-600 shrink-0">
            {count}
          </span>
        )}
      </button>

      {/* Children are unmounted while collapsed, not just hidden. Each lead
          card is a stateful client component, so a closed section that still
          rendered its cards cost as much as an open one — with hundreds of
          leads in a section that was the whole page's lag. */}
      <div id={`section-${storageKey}`} className={open ? "animate-in" : ""}>
        {open && children}
      </div>
    </section>
  );
}
