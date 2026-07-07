"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Store,
  Archive,
  Crown,
  PhoneOff,
  FileX,
  CalendarX,
  Ban,
  XCircle,
  SlidersHorizontal,
  X,
} from "lucide-react";

type PrivateChannel = {
  key: string;
  label: string;
  count: number;
};

type StatusCounts = {
  not_contact: number;
  not_docs: number;
  not_appt: number;
  spam: number;
  reject: number;
};

type Props = {
  activeTab: string;
  freshCount: number;
  marketCount: number;
  picksCount: number;
  archiveCount: number;
  showArchive?: boolean;
  statusCounts: StatusCounts;
  privateChannels: PrivateChannel[];
  q: string;
};

type TabItem = {
  key: string;
  href: string;
  label: string;
  short: string;
  count: number;
  icon: React.ReactNode;
};

export function TabBar({
  activeTab,
  freshCount,
  marketCount,
  archiveCount,
  showArchive,
  statusCounts,
  privateChannels,
}: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const pipelineTabs: TabItem[] = [
    { key: "fresh", href: "/dashboard", label: "Fresh", short: "Fresh", count: freshCount, icon: <Sparkles className="h-4 w-4" /> },
    { key: "market", href: "/dashboard?tab=market", label: "Open Market", short: "Market", count: marketCount, icon: <Store className="h-4 w-4" /> },
  ];

  // Per-status tabs live in the side drawer. APPROVED stays hidden from all.
  const statusTabs: TabItem[] = [
    { key: "not_contact", href: "/dashboard?tab=not_contact", label: "Contact · Not Able", short: "No Contact", count: statusCounts.not_contact, icon: <PhoneOff className="h-4 w-4" /> },
    { key: "not_docs",    href: "/dashboard?tab=not_docs",    label: "Documents · Not Able", short: "No Docs",   count: statusCounts.not_docs,    icon: <FileX className="h-4 w-4" /> },
    { key: "not_appt",    href: "/dashboard?tab=not_appt",    label: "Appointment · Not Able", short: "No Appt", count: statusCounts.not_appt,    icon: <CalendarX className="h-4 w-4" /> },
    { key: "spam",        href: "/dashboard?tab=spam",        label: "Spam / Missing",       short: "Spam",     count: statusCounts.spam,        icon: <Ban className="h-4 w-4" /> },
    { key: "reject",      href: "/dashboard?tab=reject",      label: "Rejected",             short: "Reject",   count: statusCounts.reject,      icon: <XCircle className="h-4 w-4" /> },
  ];
  if (showArchive) {
    statusTabs.push({
      key: "archive",
      href: "/dashboard?tab=archive",
      label: "Archive",
      short: "Archive",
      count: archiveCount,
      icon: <Archive className="h-4 w-4" />,
    });
  }

  const privateTabs: TabItem[] = privateChannels.map((ch) => ({
    key: ch.key,
    href: `/dashboard?tab=${ch.key}`,
    label: ch.label,
    short: ch.label.split(/\s+/)[0] ?? ch.label,
    count: ch.count,
    icon: <Crown className="h-4 w-4" />,
  }));

  const statusActive = statusTabs.some((t) => t.key === activeTab);
  const statusTotal = statusTabs.reduce((sum, t) => sum + t.count, 0);

  // Lock body scroll while the drawer is open, and close on Escape.
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  return (
    <div className="w-full space-y-2">
      <div className="rounded-xl bg-white/95 backdrop-blur p-1.5 ring-1 ring-ink-200 shadow-soft">
        <div className="flex flex-wrap gap-1.5">
          {pipelineTabs.map((t) => (
            <TabLink
              key={t.key}
              href={t.href}
              label={t.label}
              short={t.short}
              count={t.count}
              icon={t.icon}
              active={activeTab === t.key}
              onNavigate={() => setDrawerOpen(false)}
            />
          ))}

          {/* Status drawer trigger — sits inline with the pipeline tabs. */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            className={cn(
              "inline-flex h-11 items-center justify-center gap-1.5 min-w-0",
              "rounded-lg px-3 sm:px-4 text-[12px] sm:text-sm font-medium whitespace-nowrap transition-colors",
              statusActive
                ? "bg-ink-900 text-white shadow-sm"
                : "text-ink-700 hover:bg-ink-50 active:bg-ink-100 ring-1 ring-ink-200"
            )}
          >
            <SlidersHorizontal className={cn("h-4 w-4 shrink-0", statusActive ? "text-white" : "text-ink-500")} />
            <span className="truncate">Status</span>
            <CountPill count={statusTotal} active={statusActive} />
          </button>
        </div>

        {privateTabs.length > 0 && (
          <>
            <div className="px-1.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
              Private pipelines
            </div>
            <div className="flex flex-wrap gap-1.5">
              {privateTabs.map((t) => (
                <TabLink
                  key={t.key}
                  href={t.href}
                  label={t.label}
                  short={t.short}
                  count={t.count}
                  icon={t.icon}
                  active={activeTab === t.key}
                  onNavigate={() => setDrawerOpen(false)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ---------- Side drawer (status tabs) ---------- */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label="Filter by status">
          <button
            aria-label="Close status filters"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm animate-in"
          />
          <div className="absolute right-0 top-0 h-full w-[82%] max-w-sm bg-white shadow-lift flex flex-col animate-in-right pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-between px-4 py-4 border-b border-ink-100">
              <div>
                <h3 className="text-base font-semibold text-ink-900">Status</h3>
                <p className="text-xs text-ink-500 mt-0.5">Filter leads by outcome.</p>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-full text-ink-500 hover:bg-ink-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {statusTabs.map((t) => {
                const active = activeTab === t.key;
                return (
                  <Link
                    key={t.key}
                    href={t.href}
                    onClick={() => setDrawerOpen(false)}
                    className={cn(
                      "flex h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                      active
                        ? "bg-ink-900 text-white shadow-sm"
                        : "text-ink-700 hover:bg-ink-50 active:bg-ink-100 ring-1 ring-ink-100"
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className={cn("shrink-0", active ? "text-white" : "text-ink-500")}>{t.icon}</span>
                    <span className="flex-1 truncate">{t.label}</span>
                    <CountPill count={t.count} active={active} />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CountPill({ count, active }: { count: number; active: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 tabular-nums leading-none",
        active ? "bg-white/15 text-white ring-white/25" : "bg-ink-100 text-ink-600 ring-ink-200"
      )}
    >
      {count}
    </span>
  );
}

function TabLink({
  href,
  active,
  count,
  short,
  label,
  icon,
  onNavigate,
}: {
  href: string;
  active: boolean;
  count: number;
  short: string;
  label: string;
  icon: React.ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-1.5 min-w-0",
        "rounded-lg px-3 sm:px-4 text-[12px] sm:text-sm font-medium whitespace-nowrap",
        "transition-colors",
        active
          ? "bg-ink-900 text-white shadow-sm"
          : "text-ink-700 hover:bg-ink-50 active:bg-ink-100 ring-1 ring-ink-200"
      )}
      aria-current={active ? "page" : undefined}
    >
      <span className={cn("shrink-0", active ? "text-white" : "text-ink-500")}>{icon}</span>
      <span className="sm:hidden truncate">{short}</span>
      <span className="hidden sm:inline truncate">{label}</span>
      <CountPill count={count} active={active} />
    </Link>
  );
}
