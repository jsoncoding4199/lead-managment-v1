"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Search,
  Sparkles,
  Store,
  BookmarkCheck,
  Archive,
  Crown,
} from "lucide-react";

export type DashboardTab = "fresh" | "market" | "picks" | "archive" | "aha" | "ahb";

type Props = {
  tab: DashboardTab;
  freshCount: number;
  marketCount: number;
  picksCount: number;
  archiveCount: number;
  showAHA?: boolean;
  showAHB?: boolean;
  ahaCount?: number;
  ahbCount?: number;
  q: string;
};

type TabItem = {
  key: DashboardTab;
  href: string;
  label: string;
  short: string;
  count: number;
  icon: React.ReactNode;
};

export function TabBar({
  tab,
  freshCount,
  marketCount,
  picksCount,
  archiveCount,
  showAHA,
  showAHB,
  ahaCount = 0,
  ahbCount = 0,
  q,
}: Props) {
  const tabs: TabItem[] = [
    { key: "fresh", href: "/dashboard", label: "Fresh", short: "Fresh", count: freshCount, icon: <Sparkles className="h-4 w-4" /> },
    { key: "market", href: "/dashboard?tab=market", label: "Open Market", short: "Market", count: marketCount, icon: <Store className="h-4 w-4" /> },
    { key: "picks", href: "/dashboard?tab=picks", label: "My Pick Up", short: "Picks", count: picksCount, icon: <BookmarkCheck className="h-4 w-4" /> },
    { key: "archive", href: "/dashboard?tab=archive", label: "Archive", short: "Archive", count: archiveCount, icon: <Archive className="h-4 w-4" /> },
  ];
  if (showAHA) {
    tabs.push({ key: "aha", href: "/dashboard?tab=aha", label: "AHA", short: "AHA", count: ahaCount, icon: <Crown className="h-4 w-4" /> });
  }
  if (showAHB) {
    tabs.push({ key: "ahb", href: "/dashboard?tab=ahb", label: "AHB", short: "AHB", count: ahbCount, icon: <Crown className="h-4 w-4" /> });
  }

  // Auto-scroll the active tab into view on mobile when the route changes —
  // mirrors Material Design's scrollable tabs behavior so users on small
  // phones don't have to hunt for the active tab off-screen.
  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const active = scroller.querySelector<HTMLElement>("[data-active='true']");
    if (!active) return;
    const sLeft = scroller.scrollLeft;
    const sRight = sLeft + scroller.clientWidth;
    const aLeft = active.offsetLeft;
    const aRight = aLeft + active.offsetWidth;
    // Only scroll if active is out of view — avoids jitter on desktop.
    if (aLeft < sLeft || aRight > sRight) {
      active.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [tab]);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      {/*
        Mobile: sticky to the page top so tabs stay reachable while scrolling
        long lead lists (Android-style behavior). Horizontal scroll with
        snap-mandatory feels tactile and matches Material scrollable tabs.
        Scrollbar is hidden via inline class so the bar looks clean.
      */}
      <div
        className={cn(
          "w-full sm:w-auto max-w-full",
          "sticky top-2 sm:static z-30",
          "rounded-xl bg-white/95 backdrop-blur p-1 ring-1 ring-ink-200 shadow-soft"
        )}
      >
        <div
          ref={scrollerRef}
          className={cn(
            "flex w-full sm:w-max gap-1",
            "overflow-x-auto snap-x snap-mandatory",
            // Hide scrollbar across browsers without losing scroll capability.
            "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
            "scroll-px-2"
          )}
        >
          {tabs.map((t) => {
            const { key, ...rest } = t;
            return <TabLink key={key} {...rest} active={tab === key} />;
          })}
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
  label,
  icon,
}: {
  href: string;
  active: boolean;
  count: number;
  short: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      data-active={active}
      // h-11 = 44px — Android Material's recommended minimum touch target.
      // shrink-0 + snap-start keeps each tab a stable size and snaps cleanly
      // into view when the user swipes the bar horizontally.
      className={cn(
        "snap-start shrink-0",
        "inline-flex h-11 items-center justify-center gap-1.5",
        "rounded-lg px-3 sm:px-4 text-[12px] sm:text-sm font-medium whitespace-nowrap",
        "transition-colors min-w-[72px]",
        active
          ? "bg-ink-900 text-white shadow-sm"
          : "text-ink-700 hover:bg-ink-50 active:bg-ink-100"
      )}
      aria-current={active ? "page" : undefined}
    >
      <span className={cn("shrink-0", active ? "text-white" : "text-ink-500")}>{icon}</span>
      {/* Mobile shows the short label; desktop swaps to the longer name. */}
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{label}</span>
      <span
        className={cn(
          "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 tabular-nums leading-none",
          active ? "bg-white/15 text-white ring-white/25" : "bg-ink-100 text-ink-600 ring-ink-200"
        )}
      >
        {count}
      </span>
    </Link>
  );
}
