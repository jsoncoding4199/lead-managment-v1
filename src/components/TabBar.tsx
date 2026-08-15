import Link from "next/link";
import { cn } from "@/lib/utils";
import { Sparkles, Store, Crown, Lock, Layers } from "lucide-react";

type PrivateChannel = {
  key: string;
  label: string;
  count: number;
};

type Props = {
  activeTab: string;
  /** Master-only "Own" tab, rendered before Fresh. */
  showOwn?: boolean;
  ownCount?: number;
  freshCount: number;
  marketCount: number;
  /** Master-only "General" tab — aggregate of every private channel. */
  showGeneral?: boolean;
  generalCount?: number;
  privateChannels: PrivateChannel[];
};

type TabItem = {
  key: string;
  href: string;
  label: string;
  short: string;
  count: number;
  icon: React.ReactNode;
};

export function TabBar({ activeTab, showOwn, ownCount = 0, freshCount, marketCount, showGeneral, generalCount = 0, privateChannels }: Props) {
  const pipelineTabs: TabItem[] = [
    // Master-only "Own" tab in front of Fresh — master's private list.
    ...(showOwn
      ? [{ key: "own", href: "/dashboard?tab=own", label: "Own", short: "Own", count: ownCount, icon: <Lock className="h-4 w-4" /> }]
      : []),
    // ponytail: explicit ?tab=fresh — bare /dashboard redirects master to AH.
    { key: "fresh", href: "/dashboard?tab=fresh", label: "Fresh", short: "Fresh", count: freshCount, icon: <Sparkles className="h-4 w-4" /> },
    { key: "market", href: "/dashboard?tab=market", label: "Open Market", short: "Market", count: marketCount, icon: <Store className="h-4 w-4" /> },
  ];

  const privateTabs: TabItem[] = [
    // "General" — master-only aggregate of every private channel, before AH.
    ...(showGeneral
      ? [{ key: "general", href: "/dashboard?tab=general", label: "General", short: "General", count: generalCount, icon: <Layers className="h-4 w-4" /> }]
      : []),
    ...privateChannels.map((ch) => ({
      key: ch.key,
      href: `/dashboard?tab=${ch.key}`,
      label: ch.label,
      short: ch.label.split(/\s+/)[0] ?? ch.label,
      count: ch.count,
      icon: <Crown className="h-4 w-4" />,
    })),
  ];

  return (
    <div className="w-full">
      <div className="rounded-xl bg-white/95 backdrop-blur p-1 ring-1 ring-ink-200 shadow-soft">
        {/* Own / Fresh / Market always share one row — each cell shrinks
            rather than wrapping onto a second line on a phone. */}
        <div className="flex gap-1">
          {pipelineTabs.map((t) => (
            <TabLink key={t.key} tab={t} active={activeTab === t.key} fill />
          ))}
        </div>

        {privateTabs.length > 0 && (
          <>
            <div className="px-1.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
              Private pipelines
            </div>
            {/* One row — each cell shares the width and shrinks (min-w-0)
                rather than wrapping onto a second line. */}
            <div className="flex gap-1">
              {privateTabs.map((t) => (
                <TabLink key={t.key} tab={t} active={activeTab === t.key} fill />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TabLink({ tab, active, fill }: { tab: TabItem; active: boolean; fill?: boolean }) {
  return (
    <Link
      href={tab.href}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-1 sm:gap-1.5 min-w-0",
        fill && "flex-1",
        "rounded-lg px-1.5 sm:px-4 text-[12px] sm:text-sm font-medium whitespace-nowrap transition-colors",
        active
          ? "bg-ink-900 text-white shadow-sm"
          : "text-ink-700 hover:bg-ink-50 active:bg-ink-100 ring-1 ring-ink-200"
      )}
      aria-current={active ? "page" : undefined}
    >
      <span className={cn("shrink-0", active ? "text-white" : "text-ink-500")}>{tab.icon}</span>
      <span className="sm:hidden">{tab.short}</span>
      <span className="hidden sm:inline">{tab.label}</span>
      <span
        className={cn(
          "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 tabular-nums leading-none",
          active ? "bg-white/15 text-white ring-white/25" : "bg-ink-100 text-ink-600 ring-ink-200"
        )}
      >
        {tab.count}
      </span>
    </Link>
  );
}
