"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { LeadStatus } from "@prisma/client";
import { ChevronDown, UserCircle2, Clock, Loader2, ArrowRight, Calendar, X, StickyNote } from "lucide-react";
import { STATUS_GROUPS } from "@/lib/leadStatus";
import { timeAgo, daysAgo, formatDateTime } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import { changeStatusAction, assignLeadAction } from "@/app/dashboard/actions";
import Link from "next/link";

type Lead = {
  id: number;
  content: string;
  remark?: string | null;
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

  // Lock body scroll while bottom-sheet is open on mobile.
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

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

  const aging = daysAgo(lead.createdAt);

  return (
    <article className="card p-4 lg:p-4 hover:shadow-lift transition-shadow group flex flex-col">
      <header className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <StatusBadge status={lead.status} />
          <span className="text-[11px] text-ink-400">#{lead.id}</span>
        </div>

        <button
          onClick={() => setMenuOpen(true)}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-2 py-1 text-[11px] font-medium text-ink-700 hover:bg-ink-50 shrink-0"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Status"}
          <ChevronDown className="h-3 w-3" />
        </button>
      </header>

      <Link href={`/dashboard/leads/${lead.id}`} className="block mt-3">
        <pre className="whitespace-pre-wrap break-words rounded-lg bg-ink-50 p-3 text-[12px] leading-relaxed text-ink-800 font-mono line-clamp-4 lg:line-clamp-5">
{lead.content}
        </pre>
      </Link>

      {lead.remark && (
        <Link
          href={`/dashboard/leads/${lead.id}`}
          className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"
        >
          <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
          <p className="line-clamp-2 text-[12px] leading-relaxed text-amber-900">
            {lead.remark}
          </p>
        </Link>
      )}

      <footer className="mt-3 space-y-2 text-[11px] text-ink-500 lg:space-y-1.5">
        <div className="grid grid-cols-1 gap-1.5 lg:gap-1">
          <span className="inline-flex items-center gap-1.5">
            <UserCircle2 className="h-3 w-3 shrink-0" />
            <span className="truncate">From <strong className="text-ink-700">{lead.createdBy?.displayName ?? "—"}</strong></span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ArrowRight className="h-3 w-3 shrink-0" />
            <span className="truncate">→ <strong className="text-ink-700">{lead.assignedTo?.displayName ?? "Unassigned"}</strong></span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="h-3 w-3 shrink-0" />
            <span className="truncate">{formatDateTime(lead.createdAt)}</span>
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <span
            className={
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1 " +
              (aging >= 7
                ? "bg-rose-50 text-rose-700 ring-rose-200"
                : aging >= 3
                  ? "bg-amber-50 text-amber-800 ring-amber-200"
                  : "bg-ink-100 text-ink-600 ring-ink-200")
            }
            title={`Lead created ${formatDateTime(lead.createdAt)}`}
          >
            <Clock className="h-2.5 w-2.5" />
            {aging === 0 ? "today" : `${aging}d`}
          </span>
          <span className="text-ink-400">Updated {timeAgo(lead.updatedAt)}</span>
        </div>

        {viewerRole === "MASTER" && (
          <select
            disabled={pending}
            value={lead.assignedTo?.id ? String(lead.assignedTo.id) : ""}
            onChange={(e) => updateAssignee(e.target.value)}
            className="w-full rounded-md border border-ink-200 bg-white px-2 py-1 text-[11px] text-ink-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 mt-1"
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

      {menuOpen && (
        <StatusMenu
          currentStatus={lead.status}
          onChoose={updateStatus}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </article>
  );
}

/**
 * Responsive status picker:
 *  - mobile (<md): bottom sheet with backdrop, slides up from the bottom of the screen
 *  - desktop (≥md): centered modal with backdrop, easy to dismiss with Esc / click-away
 *
 * One menu, two layouts — keeps the code simple while behaving correctly on touch.
 */
function StatusMenu({
  currentStatus,
  onChoose,
  onClose,
}: {
  currentStatus: LeadStatus;
  onChoose: (s: LeadStatus) => void;
  onClose: () => void;
}) {
  // Portal to <body> so the modal escapes the LeadCard's stacking context
  // (the card's `backdrop-blur` creates a new context that would otherwise
  // trap a fixed-positioned child beneath sibling cards).
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalNode(document.body);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!portalNode) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <button
        aria-label="Close status menu"
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm animate-in"
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Change lead status"
        className="
          relative w-full md:w-[420px] max-h-[85vh] overflow-y-auto bg-white shadow-lift animate-in
          rounded-t-2xl md:rounded-2xl
          pb-[env(safe-area-inset-bottom)]
        "
        onClick={(e) => e.stopPropagation()}
      >
        <div className="md:hidden flex justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-ink-200" aria-hidden />
        </div>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div>
            <h3 className="text-base font-semibold text-ink-900">Change status</h3>
            <p className="text-xs text-ink-500 mt-0.5">Pick the new state for this lead.</p>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-ink-500 hover:bg-ink-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-3 pb-4">
          {STATUS_GROUPS.map((group) => (
            <div key={group.key} className="px-1 pt-3">
              <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                {group.title}
              </div>
              <div className="grid grid-cols-1 gap-1">
                {group.options.map((opt) => {
                  const isCurrent = currentStatus === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => onChoose(opt.value)}
                      className={
                        "flex items-center justify-between gap-3 rounded-xl border px-3 py-3 text-sm text-left transition-colors " +
                        (isCurrent
                          ? "border-brand-300 bg-brand-50 text-brand-800"
                          : opt.tone === "good"
                            ? "border-ink-100 hover:border-emerald-200 hover:bg-emerald-50 text-emerald-700"
                            : opt.tone === "bad"
                              ? "border-ink-100 hover:border-rose-200 hover:bg-rose-50 text-rose-700"
                              : "border-ink-100 hover:border-ink-300 hover:bg-ink-50 text-ink-800")
                      }
                    >
                      <span className="font-medium">{opt.label}</span>
                      {isCurrent ? (
                        <span className="text-[10px] uppercase tracking-wider text-brand-700">current</span>
                      ) : (
                        <ChevronDown className="h-4 w-4 -rotate-90 opacity-50" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="border-t border-ink-100 mt-4 pt-3 px-1">
            <button
              onClick={() => onChoose("NEW")}
              className="w-full rounded-xl border border-ink-100 px-3 py-3 text-left text-sm text-ink-600 hover:bg-ink-50"
            >
              Reset to New
            </button>
          </div>
        </div>
      </div>
    </div>,
    portalNode
  );
}
