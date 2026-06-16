import Link from "next/link";
import { Bell } from "lucide-react";

/**
 * Permanent header link to the notifications feed. Server-rendered — the
 * unread count comes from the layout's per-request count query, so the
 * badge updates after a navigation without any client polling.
 */
export function NotificationsBell({ unreadCount }: { unreadCount: number }) {
  const hasUnread = unreadCount > 0;
  const label =
    unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <Link
      href="/dashboard/notifications"
      aria-label={
        hasUnread
          ? `${unreadCount} unread notifications`
          : "Notifications"
      }
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-700 hover:bg-ink-50 transition"
    >
      <Bell className="h-4 w-4" />
      {hasUnread && (
        <span
          className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold leading-[18px] text-center ring-2 ring-white"
        >
          {label}
        </span>
      )}
    </Link>
  );
}
