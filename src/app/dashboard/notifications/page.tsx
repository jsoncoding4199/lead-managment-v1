import Link from "next/link";
import { ArrowLeft, Bell, BellOff, Check, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  markNotificationsReadAction,
  markNotificationReadAction,
  deleteNotificationAction,
  deleteAllNotificationsAction,
} from "./actions";

export const dynamic = "force-dynamic";

/** Kept in sync with the prune cap in sendPushToUsers (webPush.ts). */
const HISTORY_LIMIT = 50;

/**
 * Notification history — the last 50, read and unread together. Reading a
 * notification only dims it; it stays in the list until the user deletes
 * it (per-row trash, or "Clear all").
 */
export default async function NotificationsPage() {
  const user = await requireUser();

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });
  const unread = notifications.filter((n) => !n.readAt).length;

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
              Your last {HISTORY_LIMIT}. Reading one keeps it here — tap the trash to
              remove it, or <span className="font-semibold">Clear all</span>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {unread > 0 && (
              <form action={markNotificationsReadAction}>
                <button
                  type="submit"
                  className="btn btn-ghost h-9 text-xs px-3 text-ink-600 border border-ink-200"
                >
                  Mark all read
                </button>
              </form>
            )}
            {notifications.length > 0 && (
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

        {notifications.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-2 py-10 text-center">
            <BellOff className="h-8 w-8 text-ink-300" />
            <p className="text-sm text-ink-500">You&apos;re all caught up.</p>
            <p className="text-xs text-ink-400">New lead activity will show up here.</p>
          </div>
        ) : (
          <ol className="mt-4 md:mt-5 space-y-2">
            {notifications.map((n) => {
              const isUnread = !n.readAt;
              return (
                <li key={n.id}>
                  <div
                    className={cn(
                      "rounded-lg p-3 flex items-start gap-3 ring-1",
                      isUnread
                        ? "bg-brand-50 ring-brand-200"
                        : "bg-white ring-ink-200/70"
                    )}
                  >
                    <div
                      className={cn(
                        "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full",
                        isUnread
                          ? "bg-brand-100 text-brand-700"
                          : "bg-ink-100 text-ink-400"
                      )}
                    >
                      <Bell className="h-4 w-4" />
                    </div>

                    {n.url ? (
                      <form action={markNotificationReadAction} className="min-w-0 flex-1">
                        <input type="hidden" name="id" value={n.id} />
                        <input type="hidden" name="url" value={n.url} />
                        <button type="submit" className="block w-full text-left hover:opacity-80">
                          <Body n={n} isUnread={isUnread} />
                        </button>
                      </form>
                    ) : (
                      <div className="min-w-0 flex-1">
                        <Body n={n} isUnread={isUnread} />
                      </div>
                    )}

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {isUnread && (
                        <form action={markNotificationReadAction}>
                          <input type="hidden" name="id" value={n.id} />
                          <button
                            type="submit"
                            aria-label="Mark read"
                            className="inline-flex items-center gap-1 rounded-lg border border-brand-300 bg-white px-2.5 h-8 text-[11px] font-semibold text-brand-700 hover:bg-brand-100"
                          >
                            <Check className="h-3.5 w-3.5" />
                            Read
                          </button>
                        </form>
                      )}
                      <form action={deleteNotificationAction}>
                        <input type="hidden" name="id" value={n.id} />
                        <button
                          type="submit"
                          aria-label="Delete notification"
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
        {isUnread && (
          <span className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
        )}
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
