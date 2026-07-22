import { Suspense } from "react";
import Link from "next/link";
import { Home } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ACTIVE_STATUSES } from "@/lib/leadStatus";
import { logoutAction } from "@/app/login/actions";
import { Sidebar } from "@/components/Sidebar";
import { Notifier } from "@/components/Notifier";
import { PushEnableButton } from "@/components/PushEnableButton";
import { PushNudgeBanner } from "@/components/PushNudgeBanner";
import { NotificationsBell } from "@/components/NotificationsBell";
import { InstallButton } from "@/components/InstallButton";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Two tiny indexed counts run in parallel: one for the nudge banner,
  // one for the bell badge. Both are ~1ms; running them with the layout
  // means every navigation refreshes both without any client polling.
  const [pushSubCount, unreadCount, publicByStatus, myActiveByStatus] = await Promise.all([
    prisma.pushSubscription.count({ where: { userId: user.id } }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    // Per-status counts for the sidebar badges. Public leads only —
    // mirrors the status-tab queries in the dashboard page.
    prisma.lead.groupBy({
      by: ["status"],
      where: { privateChannelUserId: null },
      _count: { _all: true },
    }),
    // Non-master only sees "Able" (active) leads they're assigned to, so
    // their badges for those statuses use the assignee-restricted numbers.
    user.role === "MASTER"
      ? Promise.resolve(null)
      : prisma.lead.groupBy({
          by: ["status"],
          where: {
            privateChannelUserId: null,
            status: { in: ACTIVE_STATUSES },
            assignments: { some: { userId: user.id } },
          },
          _count: { _all: true },
        }),
  ]);
  const hasPush = pushSubCount > 0;

  const byStatus = new Map(publicByStatus.map((r) => [r.status, r._count._all]));
  if (myActiveByStatus) {
    for (const s of ACTIVE_STATUSES) byStatus.set(s, 0);
    for (const r of myActiveByStatus) byStatus.set(r.status, r._count._all);
  }
  const statusCounts: Record<string, number> = {
    able_contact: byStatus.get("CONTACT_ABLE") ?? 0,
    able_docs: byStatus.get("DOCUMENTS_ABLE") ?? 0,
    able_appt: byStatus.get("APPOINTMENT_ABLE") ?? 0,
    not_contact: byStatus.get("CONTACT_NOT_ABLE") ?? 0,
    not_docs: byStatus.get("DOCUMENTS_NOT_ABLE") ?? 0,
    not_appt: byStatus.get("APPOINTMENT_NOT_ABLE") ?? 0,
    spam: byStatus.get("SPAM_OR_MISSING") ?? 0,
    reject: byStatus.get("REJECTED") ?? 0,
    archive: (byStatus.get("APPROVED") ?? 0) + (byStatus.get("RECYCLED") ?? 0),
  };

  return (
    <div className="min-h-screen flex">
      <Suspense fallback={<aside className="hidden md:block w-64 shrink-0 bg-ink-900" />}>
        <Sidebar user={user} statusCounts={statusCounts} />
      </Suspense>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 h-14 md:h-16 border-b border-ink-200/70 bg-white/80 backdrop-blur flex items-center justify-between gap-2 pl-16 md:pl-6 pr-3 md:pr-6">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/dashboard?tab=fresh"
              aria-label="Home"
              title="Home"
              className="shrink-0 grid h-9 w-9 place-items-center rounded-lg text-ink-600 ring-1 ring-ink-200 bg-white hover:bg-ink-50 hover:text-ink-900"
            >
              <Home className="h-4 w-4" />
            </Link>
            <span className="hidden md:inline text-sm text-ink-500">Signed in as</span>
            <span className="text-sm font-medium text-ink-900 truncate max-w-[35vw] md:max-w-none">
              {user.displayName}
            </span>
            <span
              className={
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 " +
                (user.role === "MASTER"
                  ? "bg-brand-50 text-brand-700 ring-brand-200"
                  : "bg-ink-100 text-ink-600 ring-ink-200")
              }
            >
              {user.role}
            </span>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
            <InstallButton />
            <NotificationsBell unreadCount={unreadCount} />
            <PushEnableButton serverSubscribed={hasPush} />
            <Notifier />
            <form action={logoutAction}>
              <button className="btn btn-ghost h-9 px-2 md:px-4 text-xs md:text-sm">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 lg:p-10">
          <PushNudgeBanner hasServerSubscription={hasPush} />
          {children}
        </main>
      </div>
    </div>
  );
}
