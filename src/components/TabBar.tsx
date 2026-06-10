import Link from "next/link";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";

export type DashboardTab = "fresh" | "market" | "picks" | "archive";

type Props = {
  tab: DashboardTab;
  freshCount: number;
  marketCount: number;
  picksCount: number;
  archiveCount: number;
  q: string;
};

export function TabBar({ tab, freshCount, marketCount, picksCount, archiveCount, q }: Props) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="inline-flex rounded-xl bg-white p-1 ring-1 ring-ink-200 shadow-soft self-start overflow-x-auto">
        <TabLink href="/dashboard" active={tab === "fresh"} label="Fresh" count={freshCount} />
        <TabLink href="/dashboard?tab=market" active={tab === "market"} label="Open Market" count={marketCount} />
        <TabLink href="/dashboard?tab=picks" active={tab === "picks"} label="My Pick Up" count={picksCount} />
        <TabLink href="/dashboard?tab=archive" active={tab === "archive"} label="Archive" count={archiveCount} />
      </div>

      <form className="relative" action="/dashboard">
        {tab !== "fresh" && <input type="hidden" name="tab" value={tab} />}
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search lead text…"
          className="input pl-9 w-full sm:w-72"
        />
      </form>
    </div>
  );
}

function TabLink({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors",
        active ? "bg-ink-900 text-white shadow-sm" : "text-ink-600 hover:bg-ink-50"
      )}
    >
      {label}
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1",
          active ? "bg-white/10 text-white ring-white/20" : "bg-ink-100 text-ink-600 ring-ink-200"
        )}
      >
        {count}
      </span>
    </Link>
  );
}
