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
      {/*
        Outer wrapper handles the horizontal scroll when tabs overflow the
        viewport on phones; w-full + max-w-full caps it to the parent so the
        flex pills inside actually trigger overflow. w-max on the inner row
        keeps each tab from shrinking.
      */}
      <div className="w-full sm:w-auto max-w-full rounded-xl bg-white p-0.5 sm:p-1 ring-1 ring-ink-200 shadow-soft">
        <div className="flex w-full sm:w-max">
          <TabLink href="/dashboard" active={tab === "fresh"} count={freshCount} short="Fresh" long="Fresh" />
          <TabLink href="/dashboard?tab=market" active={tab === "market"} count={marketCount} short="Market" long="Open Market" />
          <TabLink href="/dashboard?tab=picks" active={tab === "picks"} count={picksCount} short="Picks" long="My Pick Up" />
          <TabLink href="/dashboard?tab=archive" active={tab === "archive"} count={archiveCount} short="Archive" long="Archive" />
        </div>
      </div>

      <form className="relative w-full sm:w-auto" action="/dashboard">
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

function TabLink({
  href,
  active,
  count,
  short,
  long,
}: {
  href: string;
  active: boolean;
  count: number;
  short: string;
  long: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        // Phones: equal-flex (basis-0 + flex-1) so each tab claims exactly 1/4
        // of the bar — no overflow, no scrolling. Compact padding + tiny text
        // make even small screens fit cleanly. Desktop reverts to natural sizing.
        "flex-1 basis-0 sm:flex-none inline-flex items-center justify-center gap-1 sm:gap-1.5 rounded-lg px-1.5 sm:px-4 py-1.5 sm:py-2 text-[11px] sm:text-sm font-medium whitespace-nowrap transition-colors min-w-0",
        active ? "bg-ink-900 text-white shadow-sm" : "text-ink-600 hover:bg-ink-50"
      )}
    >
      <span className="sm:hidden truncate">{short}</span>
      <span className="hidden sm:inline">{long}</span>
      <span
        className={cn(
          "shrink-0 rounded-full px-1 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold ring-1 tabular-nums",
          active ? "bg-white/10 text-white ring-white/20" : "bg-ink-100 text-ink-600 ring-ink-200"
        )}
      >
        {count}
      </span>
    </Link>
  );
}
