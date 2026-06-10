"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutGrid,
  Archive,
  Store,
  Users,
  KeyRound,
  Sparkles,
  Menu,
  X,
} from "lucide-react";

type Props = { user: { displayName: string; role: "MASTER" | "USER" } };

/**
 * Responsive sidebar:
 *   - desktop (md+): permanent left rail
 *   - mobile (<md):  hidden by default. A floating menu button (top-left of
 *                    the dashboard header on phones) opens a slide-out drawer.
 *
 * The drawer auto-closes whenever the route or `?tab=` query param changes
 * so tapping a link feels immediate.
 */
export function Sidebar({ user }: Props) {
  const pathname = usePathname() ?? "";
  const params = useSearchParams();
  const tab = params.get("tab") ?? "fresh";
  const [mobileOpen, setMobileOpen] = useState(false);

  const onDashboardRoot = pathname === "/dashboard";

  // Close on route / tab change.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, tab]);

  // Lock body scroll while drawer is open.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  // Esc closes the drawer.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <>
      {/* Mobile hamburger — fixed top-left, only on small screens */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-2.5 left-3 z-30 grid h-11 w-11 place-items-center rounded-xl bg-ink-900 text-white shadow-lift"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-ink-900 text-white">
        <SidebarInner user={user} pathname={pathname} tab={tab} onDashboardRoot={onDashboardRoot} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <button
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-ink-900/60 animate-in"
          />
          <aside className="relative w-72 max-w-[85%] bg-ink-900 text-white flex flex-col animate-in shadow-lift">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 grid h-9 w-9 place-items-center rounded-full text-white/70 hover:bg-white/10"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarInner
              user={user}
              pathname={pathname}
              tab={tab}
              onDashboardRoot={onDashboardRoot}
            />
          </aside>
        </div>
      )}
    </>
  );
}

function SidebarInner({
  user,
  pathname,
  tab,
  onDashboardRoot,
}: {
  user: { displayName: string; role: "MASTER" | "USER" };
  pathname: string;
  tab: string;
  onDashboardRoot: boolean;
}) {
  return (
    <>
      <div className="px-5 py-5 flex items-center gap-2 text-lg font-semibold">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 ring-1 ring-white/20">
          <Sparkles className="h-4 w-4 text-brand-300" />
        </span>
        Leadboard
      </div>

      <nav className="px-3 mt-2 space-y-1 flex-1 overflow-y-auto">
        <NavLink
          href="/dashboard"
          icon={LayoutGrid}
          active={onDashboardRoot && tab !== "market" && tab !== "archive"}
        >
          Fresh
        </NavLink>
        <NavLink
          href="/dashboard?tab=market"
          icon={Store}
          active={onDashboardRoot && tab === "market"}
        >
          Open Market
        </NavLink>
        <NavLink
          href="/dashboard?tab=archive"
          icon={Archive}
          active={onDashboardRoot && tab === "archive"}
        >
          Archive
        </NavLink>

        {user.role === "MASTER" && (
          <>
            <div className="px-3 pt-6 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
              Master
            </div>
            <NavLink
              href="/dashboard/admin"
              icon={Users}
              active={pathname === "/dashboard/admin"}
            >
              Team
            </NavLink>
            <NavLink
              href="/dashboard/admin/resets"
              icon={KeyRound}
              active={pathname.startsWith("/dashboard/admin/resets")}
            >
              Reset requests
            </NavLink>
          </>
        )}
      </nav>
      <div className="p-4 text-xs text-white/40">© {new Date().getFullYear()} Leadboard</div>
    </>
  );
}

function NavLink({
  href,
  icon: Icon,
  active,
  children,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
        active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </Link>
  );
}
