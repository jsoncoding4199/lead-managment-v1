import Link from "next/link";
import { ArrowLeft, Bell, BellOff, Check } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import {
  markNotificationsReadAction,
  markNotificationReadAction,
} from "./actions";

export const dynamic = "force-dynamic";

/**
 * Inbox view — shows only UNREAD notifications. Tapping "Read" on a row
 * marks just that one read, and it disappears on the next render. Use
 * "Mark all read" to clear them in bulk.
 */
export default async function NotificationsPage() {
  const user = await requireUser();

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id, readAt: null },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

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
              Unread messages. Tap <span className="font-semibold">Read</span> to clear one,
              or <span className="font-semibold">Mark all read</span> to clear them all.
            </p>
          </div>
          {notifications.length > 0 && (
            <form action={markNotificationsReadAction}>
              <button
                type="submit"
                className="btn btn-ghost h-9 text-xs px-3 text-ink-600 border border-ink-200"
              >
                Mark all read
              </button>
            </form>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-2 py-10 text-center">
            <BellOff className="h-8 w-8 text-ink-300" />
            <p className="text-sm text-ink-500">You&apos;re all caught up.</p>
            <p className="text-xs text-ink-400">
              New lead activity will show up here.
            </p>
          </div>
        ) : (
          <ol className="mt-4 md:mt-5 space-y-2">
            {notifications.map((n) => (
              <li key={n.id}>
                <div className="rounded-lg bg-brand-50 ring-1 ring-brand-200 p-3 flex items-start gap-3">
                  <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700">
                    <Bell className="h-4 w-4" />
                  </div>
                  {n.url ? (
                    <form
                      action={markNotificationReadAction}
                      className="min-w-0 flex-1"
                    >
                      <input type="hidden" name="id" value={n.id} />
                      <input type="hidden" name="url" value={n.url} />
                      <button
                        type="submit"
                        className="block w-full text-left hover:opacity-80"
                      >
                        <Title title={n.title} />
                        <p className="mt-0.5 text-xs text-ink-600 whitespace-pre-wrap break-words">
                          {n.body}
                        </p>
                        <p className="mt-1 text-[11px] text-ink-400">
                          {formatDateTime(n.createdAt)}
                        </p>
                      </button>
                    </form>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <Title title={n.title} />
                      <p className="mt-0.5 text-xs text-ink-600 whitespace-pre-wrap break-words">
                        {n.body}
                      </p>
                      <p className="mt-1 text-[11px] text-ink-400">
                        {formatDateTime(n.createdAt)}
                      </p>
                    </div>
                  )}
                  <form action={markNotificationReadAction} className="shrink-0">
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
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function Title({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2">
      <p className="truncate text-sm font-semibold text-ink-900">{title}</p>
      <span className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
    </div>
  );
}
