"use client";

import { useState, useTransition } from "react";
import type { LeadStatus } from "@prisma/client";
import { ChevronDown, UserCircle2, Clock, Loader2, ArrowRight } from "lucide-react";
import { STATUS_GROUPS, STATUS_LABEL } from "@/lib/leadStatus";
import { timeAgo } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import { changeStatusAction, assignLeadAction } from "@/app/dashboard/actions";
import Link from "next/link";

type Lead = {
  id: number;
  content: string;
  status: LeadStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: number; displayName: string } | null;
  assignedTo: { id: number; displayName: string } | null;
};

type Props = {
  lead: Lead;
  viewerRole: "MASTER" | "USER";
  teamUsers: { id: number; displayName: string }[];
};

export function LeadCard({ lead, viewerRole, teamUsers }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const updateStatus = (status: LeadStatus) => {
    setError(null);
    setMenuOpen(false);
    const fd = new FormData();
    fd.set("leadId", String(lead.id));
    fd.set("status", status);
    startTransition(async () => {
      const res = await changeStatusAction(fd);
      if (res?.error) setError(res.error);
    });
  };

  const updateAssignee = (assigneeId: string) => {
    setError(null);
    const fd = new FormData();
    fd.set("leadId", String(lead.id));
    fd.set("assigneeId", assigneeId);
    startTransition(async () => {
      const res = await assignLeadAction(fd);
      if (res?.error) setError(res.error);
    });
  };

  return (
    <article className="card p-5 hover:shadow-lift transition-shadow group">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <StatusBadge status={lead.status} />
          <span className="text-[11px] text-ink-400">#{lead.id}</span>
        </div>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Change status"}
            <ChevronDown className="h-3.5 w-3.5" />
          </button>

          {menuOpen && (
            <>
              {/* Click-away */}
              <button
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-30 cursor-default"
              />
              <div className="absolute right-0 z-40 mt-2 w-72 rounded-xl border border-ink-200 bg-white p-2 shadow-lift animate-in">
                {STATUS_GROUPS.map((group) => (
                  <div key={group.key} className="px-1 pt-2 pb-1">
                    <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                      {group.title}
                    </div>
                    <div className="grid grid-cols-1 gap-1">
                      {group.options.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => updateStatus(opt.value)}
                          className={
                            "flex items-center justify-between rounded-md px-2.5 py-2 text-sm hover:bg-ink-50 " +
                            (opt.tone === "good"
                              ? "text-emerald-700"
                              : opt.tone === "bad"
                                ? "text-rose-700"
                                : "text-ink-800")
                          }
                        >
                          <span>{opt.label}</span>
                          {lead.status === opt.value && (
                            <span className="text-[10px] uppercase tracking-wider text-ink-400">current</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="border-t border-ink-100 mt-2 pt-2 px-1 pb-1">
                  <button
                    onClick={() => updateStatus("NEW")}
                    className="w-full rounded-md px-2.5 py-2 text-left text-sm text-ink-600 hover:bg-ink-50"
                  >
                    Reset to New
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </header>

      <Link href={`/dashboard/leads/${lead.id}`} className="block mt-4">
        <pre className="whitespace-pre-wrap break-words rounded-lg bg-ink-50 p-3 text-[13px] leading-relaxed text-ink-800 font-mono line-clamp-6">
{lead.content}
        </pre>
      </Link>

      <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-500">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <UserCircle2 className="h-3.5 w-3.5" />
            From <strong className="text-ink-700">{lead.createdBy?.displayName ?? "—"}</strong>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ArrowRight className="h-3.5 w-3.5" />
            Assigned <strong className="text-ink-700">{lead.assignedTo?.displayName ?? "Unassigned"}</strong>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {timeAgo(lead.updatedAt)}
          </span>
        </div>

        {viewerRole === "MASTER" && (
          <select
            disabled={pending}
            value={lead.assignedTo?.id ? String(lead.assignedTo.id) : ""}
            onChange={(e) => updateAssignee(e.target.value)}
            className="rounded-md border border-ink-200 bg-white px-2 py-1 text-xs text-ink-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            aria-label="Assign to"
          >
            <option value="">Unassigned</option>
            {teamUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName}
              </option>
            ))}
          </select>
        )}
      </footer>

      {error && (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}
    </article>
  );
}
