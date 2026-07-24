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
  Hand,
  Settings,
  PhoneOff,
  FileX,
  CalendarX,
  Ban,
  XCircle,
  PhoneCall,
  FileCheck,
  CalendarCheck,
  Phone,
  FileText,
  CalendarDays,
  ChevronDown,
  LogOut,
} from "lucide-react";
import { logoutAction } from "@/app/login/actions";

type Props = {
  user: { displayName: string; role: "MASTER" | "USER" };
  /** Per-status lead counts keyed by tab key (able_contact, spam, archive…). */
  statusCounts?: Record<string, number>;
};

/**
 * Responsive sidebar:
 *   - desktop (md+): permanent left rail
 *   - mobile (<md):  hidden by default. A floating menu button (top-left of
 *                    the dashboard header on phones) opens a slide-out drawer.
 *
 * The drawer auto-closes whenever the route or `?tab=` query param changes
 * so tapping a link feels immediate.
 */
export function Sidebar({ user, statusCounts = {} }: Props) {
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
        <SidebarInner user={user} pathname={pathname} tab={tab} onDashboardRoot={onDashboardRoot} statusCounts={statusCounts} />
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
              statusCounts={statusCounts}
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
  statusCounts,
}: {
  user: { displayName: string; role: "MASTER" | "USER" };
  pathname: string;
  tab: string;
  onDashboardRoot: boolean;
  statusCounts: Record<string, number>;
}) {
  const n = (key: string) => statusCounts[key] ?? 0;
  return (
    <>
      <div className="px-5 py-5 flex items-center gap-2 text-lg font-semibold">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 ring-1 ring-white/20">
          <Sparkles className="h-4 w-4 text-brand-300" />
        </span>
        Leadboard
      </div>

      <nav className="px-3 mt-2 space-y-1 flex-1 overflow-y-auto">
        {/* Explicit ?tab=fresh — bare /dashboard triggers the master
            default-tab redirect to the AH pipeline, which would swallow
            this click. */}
        <NavLink
          href="/dashboard?tab=fresh"
          icon={LayoutGrid}
          active={onDashboardRoot && tab === "fresh"}
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
          href="/dashboard?tab=picks"
          icon={Hand}
          active={onDashboardRoot && tab === "picks"}
        >
          My Pick Up
        </NavLink>
        <NavGroup
          label="Contact"
          icon={Phone}
          count={n("able_contact") + n("not_contact")}
          activeChild={
            onDashboardRoot && (tab === "able_contact" || tab === "not_contact")
          }
        >
          <NavLink
            href="/dashboard?tab=able_contact"
            icon={PhoneCall}
            active={onDashboardRoot && tab === "able_contact"}
            count={n("able_contact")}
          >
            Able
          </NavLink>
          <NavLink
            href="/dashboard?tab=not_contact"
            icon={PhoneOff}
            active={onDashboardRoot && tab === "not_contact"}
            count={n("not_contact")}
          >
            Not Able
          </NavLink>
        </NavGroup>
        <NavGroup
          label="Documents"
          icon={FileText}
          count={n("able_docs") + n("not_docs")}
          activeChild={
            onDashboardRoot && (tab === "able_docs" || tab === "not_docs")
          }
        >
          <NavLink
            href="/dashboard?tab=able_docs"
            icon={FileCheck}
            active={onDashboardRoot && tab === "able_docs"}
            count={n("able_docs")}
          >
            Able
          </NavLink>
          <NavLink
            href="/dashboard?tab=not_docs"
            icon={FileX}
            active={onDashboardRoot && tab === "not_docs"}
            count={n("not_docs")}
          >
            Not Able
          </NavLink>
        </NavGroup>
        <NavGroup
          label="Appointment"
          icon={CalendarDays}
          count={n("able_appt") + n("not_appt")}
          activeChild={
            onDashboardRoot && (tab === "able_appt" || tab === "not_appt")
          }
        >
          <NavLink
            href="/dashboard?tab=able_appt"
            icon={CalendarCheck}
            active={onDashboardRoot && tab === "able_appt"}
            count={n("able_appt")}
          >
            Able
          </NavLink>
          <NavLink
            href="/dashboard?tab=not_appt"
            icon={CalendarX}
            active={onDashboardRoot && tab === "not_appt"}
            count={n("not_appt")}
          >
            Not Able
          </NavLink>
        </NavGroup>
        <NavLink
          href="/dashboard?tab=spam"
          icon={Ban}
          active={onDashboardRoot && tab === "spam"}
          count={n("spam")}
        >
          Spam / Missing
        </NavLink>
        <NavLink
          href="/dashboard?tab=reject"
          icon={XCircle}
          active={onDashboardRoot && tab === "reject"}
          count={n("reject")}
        >
          Rejected
        </NavLink>
        <NavLink
          href="/dashboard?tab=archive"
          icon={Archive}
          active={onDashboardRoot && tab === "archive"}
          count={n("archive")}
        >
          Archive
        </NavLink>

        <div className="px-3 pt-6 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
          Account
        </div>
        <NavLink
          href="/dashboard/settings"
          icon={Settings}
          active={pathname === "/dashboard/settings"}
        >
          Settings
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
      <div className="p-3 border-t border-white/10">
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            <span className="flex-1 text-left">Sign out</span>
          </button>
        </form>
        <p className="px-3 pt-2 text-xs text-white/40">
          © {new Date().getFullYear()} Leadboard
        </p>
      </div>
    </>
  );
}

function NavGroup({
  label,
  icon: Icon,
  activeChild,
  count,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  activeChild: boolean;
  count?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(activeChild);
  useEffect(() => {
    if (activeChild) setOpen(true);
  }, [activeChild]);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
          activeChild
            ? "bg-white/10 text-white"
            : "text-white/70 hover:bg-white/5 hover:text-white"
        )}
        aria-expanded={open}
      >
        <Icon className="h-4 w-4" />
        <span className="flex-1 text-left">{label}</span>
        <CountBadge count={count} />
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && <div className="mt-1 ml-4 space-y-1">{children}</div>}
    </div>
  );
}

function NavLink({
  href,
  icon: Icon,
  active,
  count,
  children,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  count?: number;
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
      <span className="flex-1">{children}</span>
      <CountBadge count={count} />
    </Link>
  );
}

/** Right-aligned lead-count pill. Hidden when count is undefined; zero renders dimmed. */
function CountBadge({ count }: { count?: number }) {
  if (count === undefined) return null;
  return (
    <span
      className={cn(
        "min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums",
        count > 0 ? "bg-white/15 text-white" : "bg-white/5 text-white/40"
      )}
    >
      {count}
    </span>
  );
}
