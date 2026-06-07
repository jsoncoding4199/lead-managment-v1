"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutGrid, Archive, Users, KeyRound, Sparkles } from "lucide-react";

type Props = { user: { displayName: string; role: "MASTER" | "USER" } };

export function Sidebar({ user }: Props) {
  const pathname = usePathname() ?? "";
  const params = useSearchParams();
  const tab = params.get("tab") ?? "open";

  const onDashboardRoot = pathname === "/dashboard";

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col bg-ink-900 text-white">
      <div className="px-5 py-5 flex items-center gap-2 text-lg font-semibold">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 ring-1 ring-white/20">
          <Sparkles className="h-4 w-4 text-brand-300" />
        </span>
        Leadboard
      </div>

      <nav className="px-3 mt-2 space-y-1 flex-1">
        <NavLink href="/dashboard" icon={LayoutGrid} active={onDashboardRoot && tab !== "archive"}>
          Open leads
        </NavLink>
        <NavLink href="/dashboard?tab=archive" icon={Archive} active={onDashboardRoot && tab === "archive"}>
          Archive
        </NavLink>

        {user.role === "MASTER" && (
          <>
            <div className="px-3 pt-6 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
              Master
            </div>
            <NavLink href="/dashboard/admin" icon={Users} active={pathname === "/dashboard/admin"}>
              Team
            </NavLink>
            <NavLink href="/dashboard/admin/resets" icon={KeyRound} active={pathname.startsWith("/dashboard/admin/resets")}>
              Reset requests
            </NavLink>
          </>
        )}
      </nav>
      <div className="p-4 text-xs text-white/40">© {new Date().getFullYear()} Leadboard</div>
    </aside>
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
