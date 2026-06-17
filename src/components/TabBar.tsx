import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Store,
  BookmarkCheck,
  Archive,
  Crown,
} from "lucide-react";

type PrivateChannel = {
  key: string;
  label: string;
  count: number;
};

type Props = {
  activeTab: string;
  freshCount: number;
  marketCount: number;
  picksCount: number;
  archiveCount: number;
  showArchive?: boolean;
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
  picksCount,
  archiveCount,
  showArchive,
  privateChannels,
  q,
}: Props) {
  const tabs: TabItem[] = [
    { key: "fresh", href: "/dashboard", label: "Fresh", short: "Fresh", count: freshCount, icon: <Sparkles className="h-4 w-4" /> },
    { key: "market", href: "/dashboard?tab=market", label: "Open Market", short: "Market", count: marketCount, icon: <Store className="h-4 w-4" /> },
    { key: "picks", href: "/dashboard?tab=picks", label: "My Pick Up", short: "Picks", count: picksCount, icon: <BookmarkCheck className="h-4 w-4" /> },
  ];
  if (showArchive) {
    tabs.push({
      key: "archive",
      href: "/dashboard?tab=archive",
      label: "Archive",
      short: "Archive",
      count: archiveCount,
      icon: <Archive className="h-4 w-4" />,
    });
  }
  for (const ch of privateChannels) {
    tabs.push({
      key: ch.key,
      href: `/dashboard?tab=${ch.key}`,
      label: ch.label,
      short: ch.label.split(/\s+/)[0] ?? ch.label,
      count: ch.count,
      icon: <Crown className="h-4 w-4" />,
    });
  }

  // Mobile: aim for 2 cols by default, but cap at 3 cols so labels stay
  // legible. Wraps to 3+ rows automatically when there are many tabs
  // (e.g. 4 private-channel users + 4 static tabs = 8 tabs → 3 cols, 3 rows).
  const mobileCols = tabs.length <= 4 ? 2 : tabs.length <= 9 ? 3 : 4;

  return (
    <div
      className={cn(
        "w-full",
        "sticky top-2 z-30",
        "rounded-xl bg-white/95 backdrop-blur p-1 ring-1 ring-ink-200 shadow-soft"
      )}
    >
      <div
        className="grid gap-1 sm:flex sm:flex-wrap sm:gap-1"
        style={{ gridTemplateColumns: `repeat(${mobileCols}, minmax(0, 1fr))` }}
      >
        {tabs.map((t) => (
          <TabLink
            key={t.key}
            href={t.href}
            label={t.label}
            short={t.short}
            count={t.count}
            icon={t.icon}
            active={activeTab === t.key}
          />
        ))}
      </div>
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
      className={cn(
        "inline-flex h-11 items-center justify-center gap-1.5 min-w-0",
        "rounded-lg px-2 sm:px-4 text-[12px] sm:text-sm font-medium whitespace-nowrap",
        "transition-colors",
        active
          ? "bg-ink-900 text-white shadow-sm"
          : "text-ink-700 hover:bg-ink-50 active:bg-ink-100"
      )}
      aria-current={active ? "page" : undefined}
    >
      <span className={cn("shrink-0", active ? "text-white" : "text-ink-500")}>{icon}</span>
      <span className="sm:hidden truncate">{short}</span>
      <span className="hidden sm:inline truncate">{label}</span>
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
