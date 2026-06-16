import Link from "next/link";
import { ArrowLeft, Bell, BellOff } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import { markNotificationsReadAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to leads
      </Link>

      <div className="card p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold text-ink-900">Notifications</h1>
            <p className="mt-0.5 text-xs text-ink-500">
              Everything the system pushed to you, newest first.
              {unreadCount > 0 && (
                <>
                  {" "}
                  <span className="font-medium text-brand-700">
                    {unreadCount} new
                  </span>
                </>
              )}
            </p>
          </div>
          {unreadCount > 0 && (
            <form action={markNotificationsReadAction}>
              <button
                type="submit"
                className="btn btn-ghost h-8 text-xs px-3 text-ink-600"
              >
                Mark all read
              </button>
            </form>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-2 py-8 text-center">
            <BellOff className="h-8 w-8 text-ink-300" />
            <p className="text-sm text-ink-500">No notifications yet.</p>
            <p className="text-xs text-ink-400">
              You&apos;ll see lead events here as they happen.
            </p>
          </div>
        ) : (
          <ol className="mt-5 space-y-2">
            {notifications.map((n) => {
              const unread = !n.readAt;
              const Inner = (
                <div
                  className={
                    "flex items-start gap-3 rounded-lg p-3 transition " +
                    (unread
                      ? "bg-brand-50 ring-1 ring-brand-200 hover:bg-brand-100"
                      : "bg-ink-50 hover:bg-ink-100")
                  }
                >
                  <div
                    className={
                      "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full " +
                      (unread
                        ? "bg-brand-100 text-brand-700"
                        : "bg-ink-100 text-ink-500")
                    }
                  >
                    <Bell className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p
                        className={
                          "truncate text-sm " +
                          (unread
                            ? "font-semibold text-ink-900"
                            : "font-medium text-ink-700")
                        }
                      >
                        {n.title}
                      </p>
                      {unread && (
                        <span className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-ink-600">{n.body}</p>
                    <p className="mt-1 text-[11px] text-ink-400">
                      {formatDateTime(n.createdAt)}
                    </p>
                  </div>
                </div>
              );
              return (
                <li key={n.id}>
                  {n.url ? (
                    <Link href={n.url} className="block">
                      {Inner}
                    </Link>
                  ) : (
                    Inner
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
