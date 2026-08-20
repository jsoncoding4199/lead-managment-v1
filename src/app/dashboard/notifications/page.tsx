import Link from "next/link";
import { ArrowLeft, Bell, BellOff, Trash2, Inbox, Hand, Activity } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime, cn } from "@/lib/utils";
import {
  openNotificationAction,
  deleteNotificationAction,
  deleteAllNotificationsAction,
} from "./actions";

export const dynamic = "force-dynamic";

/** Kept in sync with the prune cap in sendPushToUsers (webPush.ts). */
const HISTORY_LIMIT = 50;

type Cat = "assign" | "pickup" | "status";
type NotifRow = {
  id: number;
  title: string;
  body: string;
  url: string | null;
  kind: string | null;
  readAt: Date | null;
  createdAt: Date;
};

/**
 * Sort a notification into one of the three feed tabs. New notifications
 * carry an explicit kind ("assign"/"pickup"/"status"); legacy rows
 * ("lead"/null) are classified from their message text.
 */
function categorize(n: NotifRow): Cat {
  const k = (n.kind ?? "").toLowerCase();
  if (k === "assign") return "assign";
  if (k === "pickup") return "pickup";
  if (k === "status" || k === "approved") return "status";
  const t = `${n.title} ${n.body}`.toLowerCase();
  if (/picked up|has seen|seen and|acknowledg|as ok|confirmed/.test(t)) return "pickup";
  if (/private pipeline|assigned you|reassigned|handed lead/.test(t)) return "assign";
  return "status";
}

const TABS: { key: Cat; label: string; short: string; icon: typeof Inbox }[] = [
  { key: "assign", label: "Assigned to me", short: "Assigned", icon: Inbox },
  { key: "pickup", label: "OK / Pick up", short: "OK / Pick", icon: Hand },
  { key: "status", label: "Status changes", short: "Status", icon: Activity },
];

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ nt?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const active: Cat = TABS.some((t) => t.key === sp.nt) ? (sp.nt as Cat) : "assign";

  const all = (await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  })) as NotifRow[];

  // Bucket + per-tab unread counts in one pass.
  const buckets: Record<Cat, NotifRow[]> = { assign: [], pickup: [], status: [] };
  const unread: Record<Cat, number> = { assign: 0, pickup: 0, status: 0 };
  for (const n of all) {
    const c = categorize(n);
    buckets[c].push(n);
    if (!n.readAt) unread[c]++;
  }
  const shown = buckets[active];

  return (
    <div className="max-w-2xl space-y-4 md:space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to leads
      </Link>

      <div className="card p-4 md:p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-ink-900">Notifications</h1>
            <p className="mt-0.5 text-xs text-ink-500">
              Reading one removes it, revealing older ones. Up to {HISTORY_LIMIT} kept.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {all.length > 0 && (
              <form action={deleteAllNotificationsAction}>
                <button
                  type="submit"
                  className="btn btn-ghost h-9 text-xs px-3 text-rose-600 border border-rose-200 hover:bg-rose-50"
                >
                  Clear all
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Three tabs. "Assigned to me" is the priority feed — it gets a
            bolder treatment (brand fill when active, brand ring + accent
            when not) so it always reads as the important one. */}
        <div className="mt-4 flex gap-1.5">
          {TABS.map((t) => {
            const isActive = t.key === active;
            const isPriority = t.key === "assign";
            const n = unread[t.key];
            return (
              <Link
                key={t.key}
                href={`/dashboard/notifications?nt=${t.key}`}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex flex-1 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 h-10 text-[12px] font-medium transition-colors",
                  isActive
                    ? isPriority
                      ? "bg-brand-600 text-white shadow-sm"
                      : "bg-ink-900 text-white shadow-sm"
                    : isPriority
                      ? "bg-brand-50 text-brand-800 ring-1 ring-brand-300 hover:bg-brand-100"
                      : "text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50"
                )}
              >
                <t.icon className="h-3.5 w-3.5 shrink-0" />
                <span className="sm:hidden truncate">{t.short}</span>
                <span className="hidden sm:inline truncate">{t.label}</span>
                {n > 0 && (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none",
                      isActive
                        ? "bg-white/20 text-white"
                        : isPriority
                          ? "bg-brand-600 text-white"
                          : "bg-ink-200 text-ink-700"
                    )}
                  >
                    {n}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {shown.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-2 py-10 text-center">
            <BellOff className="h-8 w-8 text-ink-300" />
            <p className="text-sm text-ink-500">Nothing here yet.</p>
            <p className="text-xs text-ink-400">
              {active === "assign"
                ? "Leads assigned or added to your channel will show up here."
                : active === "pickup"
                  ? "OK / pick-up activity will show up here."
                  : "Lead status changes will show up here."}
            </p>
          </div>
        ) : (
          <ol className="mt-4 md:mt-5 space-y-2">
            {shown.map((n) => {
              const isUnread = !n.readAt;
              return (
                <li key={n.id}>
                  <div
                    className={cn(
                      "rounded-lg p-3 flex items-start gap-3 ring-1",
                      isUnread ? "bg-brand-50 ring-brand-200" : "bg-white ring-ink-200/70"
                    )}
                  >
                    <div
                      className={cn(
                        "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full",
                        isUnread ? "bg-brand-100 text-brand-700" : "bg-ink-100 text-ink-400"
                      )}
                    >
                      <Bell className="h-4 w-4" />
                    </div>

                    {n.url ? (
                      <form action={openNotificationAction} className="min-w-0 flex-1">
                        <input type="hidden" name="id" value={n.id} />
                        <input type="hidden" name="url" value={n.url} />
                        <button type="submit" className="block w-full text-left hover:opacity-80" title="Open lead & remove">
                          <Body n={n} isUnread={isUnread} />
                        </button>
                      </form>
                    ) : (
                      <div className="min-w-0 flex-1">
                        <Body n={n} isUnread={isUnread} />
                      </div>
                    )}

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <form action={deleteNotificationAction}>
                        <input type="hidden" name="id" value={n.id} />
                        <button
                          type="submit"
                          aria-label="Dismiss notification"
                          title="Dismiss"
                          className="grid h-8 w-8 place-items-center rounded-lg border border-ink-200 bg-white text-ink-400 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </form>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

function Body({
  n,
  isUnread,
}: {
  n: { title: string; body: string; createdAt: Date };
  isUnread: boolean;
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        <p
          className={cn(
            "break-words text-sm font-semibold",
            isUnread ? "text-ink-900" : "text-ink-600"
          )}
        >
          {n.title}
        </p>
        {isUnread && <span className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />}
      </div>
      <p
        className={cn(
          "mt-0.5 text-xs whitespace-pre-wrap break-words",
          isUnread ? "text-ink-600" : "text-ink-400"
        )}
      >
        {n.body}
      </p>
      <p className="mt-1 text-[11px] text-ink-400">{formatDateTime(n.createdAt)}</p>
    </>
  );
}
