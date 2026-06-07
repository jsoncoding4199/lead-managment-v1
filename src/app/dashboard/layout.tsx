import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { logoutAction } from "@/app/login/actions";
import { Sidebar } from "@/components/Sidebar";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen flex">
      <Suspense fallback={<aside className="hidden md:block w-64 shrink-0 bg-ink-900" />}>
        <Sidebar user={user} />
      </Suspense>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-10 h-16 border-b border-ink-200/70 bg-white/70 backdrop-blur flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <h1 className="text-sm text-ink-500">Signed in as</h1>
            <span className="text-sm font-medium text-ink-900">{user.displayName}</span>
            <span
              className={
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 " +
                (user.role === "MASTER"
                  ? "bg-brand-50 text-brand-700 ring-brand-200"
                  : "bg-ink-100 text-ink-600 ring-ink-200")
              }
            >
              {user.role}
            </span>
          </div>
          <form action={logoutAction}>
            <button className="btn btn-ghost h-9 text-sm">Sign out</button>
          </form>
        </header>
        <main className="flex-1 p-6 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
