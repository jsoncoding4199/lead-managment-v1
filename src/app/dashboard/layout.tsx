import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { logoutAction } from "@/app/login/actions";
import { Sidebar } from "@/components/Sidebar";
import { Notifier } from "@/components/Notifier";
import { PushEnableButton } from "@/components/PushEnableButton";
import { InstallButton } from "@/components/InstallButton";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen flex">
      <Suspense fallback={<aside className="hidden md:block w-64 shrink-0 bg-ink-900" />}>
        <Sidebar user={user} />
      </Suspense>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 h-14 md:h-16 border-b border-ink-200/70 bg-white/80 backdrop-blur flex items-center justify-between gap-2 pl-16 md:pl-6 pr-3 md:pr-6">
          <div className="flex items-center gap-2 min-w-0">
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
            <PushEnableButton />
            <Notifier />
            <form action={logoutAction}>
              <button className="btn btn-ghost h-9 px-2 md:px-4 text-xs md:text-sm">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
