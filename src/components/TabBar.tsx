import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Store,
  BookmarkCheck,
  Archive,
  Crown,
  PhoneOff,
  FileX,
  CalendarX,
  Ban,
  XCircle,
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
  picksCount,
  archiveCount,
  showArchive,
  statusCounts,
  privateChannels,
  q,
}: Props) {
  const pipelineTabs: TabItem[] = [
    { key: "fresh", href: "/dashboard", label: "Fresh", short: "Fresh", count: freshCount, icon: <Sparkles className="h-4 w-4" /> },
    { key: "market", href: "/dashboard?tab=market", label: "Open Market", short: "Market", count: marketCount, icon: <Store className="h-4 w-4" /> },
  ];

  const picksTabs: TabItem[] = [
    { key: "picks", href: "/dashboard?tab=picks", label: "My Pick Up", short: "Picks", count: picksCount, icon: <BookmarkCheck className="h-4 w-4" /> },
  ];

  // Per-status tabs — visible to everyone. APPROVED stays hidden from all.
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

  const groups: { name: string; tabs: TabItem[] }[] = [
    { name: "Pipeline", tabs: pipelineTabs },
    { name: "My Pick Up", tabs: picksTabs },
    { name: "Status", tabs: statusTabs },
    ...(privateTabs.length > 0 ? [{ name: "Private pipelines", tabs: privateTabs }] : []),
  ];

  return (
    // ponytail: no sticky — four stacked groups would pin most of a phone
    // viewport. Scroll back up to switch tabs.
    <div className="w-full space-y-2">
      {groups.map((g) => {
        const mobileCols = Math.min(g.tabs.length, 3);
        return (
          <div
            key={g.name}
            className="rounded-xl bg-white/95 backdrop-blur p-1 ring-1 ring-ink-200 shadow-soft"
          >
            <div className="px-2 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
              {g.name}
            </div>
            <div
              className="grid gap-1 sm:flex sm:flex-wrap sm:gap-1"
              style={{ gridTemplateColumns: `repeat(${mobileCols}, minmax(0, 1fr))` }}
            >
              {g.tabs.map((t) => (
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
      })}
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
