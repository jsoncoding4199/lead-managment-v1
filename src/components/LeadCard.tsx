"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { LeadStatus, LeadQuality } from "@prisma/client";
import {
  ChevronDown,
  UserCircle2,
  Clock,
  Loader2,
  Calendar,
  X,
  StickyNote,
  Hand,
  LogOut,
  Users,
  Check,
  ArrowRight,
  Send,
  BellRing,
} from "lucide-react";
import { STATUS_GROUPS } from "@/lib/leadStatus";
import { timeAgo, daysAgo, formatDateTime, cn } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import { QualityBadge, QualityPicker } from "./QualityPicker";
import {
  changeStatusAction,
  pickUpLeadAction,
  dropWithStatusAction,
  setLeadAssignmentsAction,
  updateLeadQualityAction,
  resetToOpenMarketAction,
  reassignPrivateLeadAction,
  setContactStateAction,
  pingLeadAction,
  ackLeadAction,
  masterOkLeadAction,
  setReminderAction,
} from "@/app/dashboard/actions";
import Link from "next/link";

type Lead = {
  id: number;
  content: string;
  remark?: string | null;
  status: LeadStatus;
  quality: LeadQuality | null;
  contactState?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: number; displayName: string } | null;
  assignees: { id: number; displayName: string }[];
  privateChannelUserId?: number | null;
  ackedAt?: string | null;
  ackedBy?: { id: number; displayName: string } | null;
  myReminderAt?: string | null;
};

const CONTACT_STATE_OPTIONS: { value: string; label: string }[] = [
  { value: "NEW", label: "New" },
  { value: "CALLED_BEFORE", label: "Called Before" },
  { value: "WHATSAPP_BEFORE", label: "WhatsApp Before" },
];

function contactStateLabel(state: string | undefined): string {
  const hit = CONTACT_STATE_OPTIONS.find((o) => o.value === state);
  return hit?.label ?? "New";
}

/** "45m", "2h", "3h 10m" — best-effort short label of time until remindAt. */
function remindersRemainingLabel(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "now";
  const totalMinutes = Math.floor(ms / 60_000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

type Viewer = { id: number; role: "MASTER" | "USER" };

type Props = {
  lead: Lead;
  viewer: Viewer;
  teamUsers: { id: number; displayName: string }[];
  maxPickup: number;
  /** Other active team users — handover targets for reassign. */
  reassignTargets?: { id: number; displayName: string; isPrivateChannel?: boolean }[];
};

export function LeadCard({ lead, viewer, teamUsers, maxPickup, reassignTargets }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [contactStateOpen, setContactStateOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderHours, setReminderHours] = useState(1);
  const [reminderMinutes, setReminderMinutes] = useState(0);
  // ponytail: per-mount only — a page refresh re-enables Ping/OK. Fine;
  // these are stateless notifications, not tracked acknowledgements.
  const [pinged, setPinged] = useState(false);
  const [acked, setAcked] = useState(false);
  const [masterOkSent, setMasterOkSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Lock body scroll while any portal modal is open.
  useEffect(() => {
    if (!menuOpen && !assignOpen && !qualityOpen && !dropOpen && !reassignOpen && !reminderOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen, assignOpen, qualityOpen, dropOpen, reassignOpen, reminderOpen]);

  const setContactState = (state: string) => {
    setError(null);
    setContactStateOpen(false);
    const fd = new FormData();
    fd.set("leadId", String(lead.id));
    fd.set("contactState", state);
    startTransition(async () => {
      const res = await setContactStateAction(fd);
      if (res?.error) setError(res.error);
    });
  };

  const updateStatus = (status: LeadStatus, note?: string) => {
    setError(null);
    setMenuOpen(false);
    const fd = new FormData();
    fd.set("leadId", String(lead.id));
    fd.set("status", status);
    if (note && note.trim()) fd.set("note", note.trim());
    startTransition(async () => {
      const res = await changeStatusAction(fd);
      if (res?.error) setError(res.error);
    });
  };

  const resetToOpenMarket = () => {
    setError(null);
    setMenuOpen(false);
    const fd = new FormData();
    fd.set("leadId", String(lead.id));
    startTransition(async () => {
      const res = await resetToOpenMarketAction(fd);
      if (res?.error) setError(res.error);
    });
  };

  const pickUp = () => {
    setError(null);
    const fd = new FormData();
    fd.set("leadId", String(lead.id));
    startTransition(async () => {
      const res = await pickUpLeadAction(fd);
      if (res?.error) setError(res.error);
    });
  };

  const dropWithStatus = (status: LeadStatus, note?: string) => {
    setError(null);
    setDropOpen(false);
    const trimmed = note?.trim();
    startTransition(async () => {
      const res = await dropWithStatusAction({
        leadId: lead.id,
        status,
        note: trimmed && trimmed.length > 0 ? trimmed : undefined,
      });
      if (res?.error) setError(res.error);
    });
  };

  const setAssignments = (userIds: number[]) => {
    setError(null);
    startTransition(async () => {
      const res = await setLeadAssignmentsAction({ leadId: lead.id, userIds });
      if (res?.error) setError(res.error);
      else setAssignOpen(false);
    });
  };

  const setQuality = (quality: LeadQuality | null) => {
    setError(null);
    setQualityOpen(false);
    const fd = new FormData();
    fd.set("leadId", String(lead.id));
    fd.set("quality", quality ?? "");
    startTransition(async () => {
      const res = await updateLeadQualityAction(fd);
      if (res?.error) setError(res.error);
    });
  };

  const ping = () => {
    setError(null);
    const fd = new FormData();
    fd.set("leadId", String(lead.id));
    startTransition(async () => {
      const res = await pingLeadAction(fd);
      if (res?.error) setError(res.error);
      else {
        // Flash "Pinged ✓" for a moment, then re-arm so master can ping again.
        setPinged(true);
        setTimeout(() => setPinged(false), 1500);
      }
    });
  };

  const masterOk = () => {
    setError(null);
    const fd = new FormData();
    fd.set("leadId", String(lead.id));
    startTransition(async () => {
      const res = await masterOkLeadAction(fd);
      if (res?.error) setError(res.error);
      else {
        // Flash "OK sent ✓" then re-arm — master can confirm again anytime.
        setMasterOkSent(true);
        setTimeout(() => setMasterOkSent(false), 1500);
      }
    });
  };

  const acknowledge = () => {
    setError(null);
    const fd = new FormData();
    fd.set("leadId", String(lead.id));
    startTransition(async () => {
      const res = await ackLeadAction(fd);
      if (res?.error) setError(res.error);
      else setAcked(true);
    });
  };

  const setReminder = (minutes: number) => {
    setError(null);
    setReminderOpen(false);
    const fd = new FormData();
    fd.set("leadId", String(lead.id));
    fd.set("minutes", String(minutes));
    startTransition(async () => {
      const res = await setReminderAction(fd);
      if (res?.error) setError(res.error);
    });
  };

  const reassign = (targetUserId: number, remark: string) => {
    setError(null);
    const fd = new FormData();
    fd.set("leadId", String(lead.id));
    fd.set("targetUserId", String(targetUserId));
    fd.set("remark", remark);
    startTransition(async () => {
      const res = await reassignPrivateLeadAction(fd);
      if (res?.error) setError(res.error);
      else setReassignOpen(false);
    });
  };

  const aging = daysAgo(lead.createdAt);
  const iAmAssigned = lead.assignees.some((a) => a.id === viewer.id);
  const atCapacity = lead.assignees.length >= maxPickup;
  const iOwnThisChannel =
    lead.privateChannelUserId != null && lead.privateChannelUserId === viewer.id;
  // Master can reassign ANY lead — public or private — to any pipeline.
  const canReassign = iOwnThisChannel || viewer.role === "MASTER";

  return (
    <article className="card p-4 lg:p-4 hover:shadow-lift transition-shadow group flex flex-col">
      <header className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap relative">
          {lead.status === "NEW" ? (
            <button
              onClick={() => setContactStateOpen((v) => !v)}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-700 ring-1 ring-ink-200 hover:bg-ink-200"
              aria-label="Change contact state"
            >
              {contactStateLabel(lead.contactState)}
              <ChevronDown className="h-3 w-3" />
            </button>
          ) : (
            <StatusBadge status={lead.status} />
          )}
          <button
            onClick={() => setQualityOpen(true)}
            disabled={pending}
            className="cursor-pointer hover:opacity-80"
            aria-label="Rate quality"
          >
            <QualityBadge quality={lead.quality} />
          </button>
          <span className="text-[11px] text-ink-400">#{lead.id}</span>

          {contactStateOpen && lead.status === "NEW" && (
            <div
              className="absolute top-7 left-0 z-20 w-44 rounded-lg border border-ink-200 bg-white shadow-lift py-1"
              onMouseLeave={() => setContactStateOpen(false)}
            >
              {CONTACT_STATE_OPTIONS.map((opt) => {
                const isCurrent = (lead.contactState ?? "NEW") === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setContactState(opt.value)}
                    className={cn(
                      "block w-full px-3 py-2 text-left text-xs",
                      isCurrent
                        ? "bg-brand-50 text-brand-700 font-semibold"
                        : "text-ink-700 hover:bg-ink-50"
                    )}
                  >
                    {opt.label}
                    {isCurrent && <Check className="inline h-3 w-3 ml-1" />}
                  </button>
                );
              })}
            </div>
          )}
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

      <div className="mt-3 relative group/content">
        <pre
          onClick={(e) => e.stopPropagation()}
          className="whitespace-pre-wrap break-words rounded-lg bg-ink-50 p-3 text-[12px] leading-relaxed text-ink-800 font-mono max-h-32 lg:max-h-40 overflow-y-auto overscroll-contain"
        >
{lead.content}
        </pre>
        <Link
          href={`/dashboard/leads/${lead.id}`}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm ring-1 ring-brand-700/20 hover:bg-brand-700 active:bg-brand-800 transition-colors"
        >
          Open details
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

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

      {/* Assignees row */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Users className="h-3 w-3 text-ink-400" />
        {lead.assignees.length === 0 ? (
          <span className="text-[11px] text-ink-400 italic">Nobody picked up yet</span>
        ) : (
          lead.assignees.map((a) => (
            <span
              key={a.id}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1",
                a.id === viewer.id
                  ? "bg-brand-50 text-brand-700 ring-brand-200"
                  : "bg-ink-100 text-ink-700 ring-ink-200"
              )}
            >
              {a.displayName}
              {a.id === viewer.id && <Check className="h-2.5 w-2.5" />}
            </span>
          ))
        )}
        <span className="ml-auto text-[10px] text-ink-400">
          {lead.assignees.length}/{maxPickup}
        </span>
      </div>

      <footer className="mt-3 space-y-2 text-[11px] text-ink-500">
        <div className="grid grid-cols-1 gap-1.5">
          <span className="inline-flex items-center gap-1.5">
            <UserCircle2 className="h-3 w-3 shrink-0" />
            <span className="truncate">From <strong className="text-ink-700">{lead.createdBy?.displayName ?? "—"}</strong></span>
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

        {/* Pickup / drop / master assignment controls */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {iAmAssigned ? (
            <button
              onClick={() => setDropOpen(true)}
              disabled={pending}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-rose-200 bg-white px-2 text-[11px] font-medium text-rose-700 hover:bg-rose-50"
            >
              <LogOut className="h-3 w-3" />
              Drop
            </button>
          ) : (
            <button
              onClick={pickUp}
              disabled={pending || (atCapacity && viewer.role !== "MASTER")}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-2 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Hand className="h-3 w-3" />
              {atCapacity ? "Full" : "Pick up"}
            </button>
          )}

          {viewer.role === "MASTER" && (
            <button
              onClick={() => setAssignOpen(true)}
              disabled={pending}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2 text-[11px] font-medium text-ink-700 hover:bg-ink-50"
            >
              <Users className="h-3 w-3" />
              Assign
            </button>
          )}

          {canReassign && (
            <button
              onClick={() => setReassignOpen(true)}
              disabled={pending}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-violet-200 bg-white px-2 text-[11px] font-medium text-violet-700 hover:bg-violet-50"
            >
              <Send className="h-3 w-3" />
              {viewer.role === "MASTER" ? "Pipeline" : "Assign"}
            </button>
          )}

          {viewer.role === "MASTER" ? (
            <>
              <button
                onClick={ping}
                disabled={pending}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-amber-200 bg-white px-2 text-[11px] font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-60"
              >
                <BellRing className="h-3 w-3" />
                {pinged ? "Pinged ✓" : "Ping"}
              </button>
              {/* Master OK — notifies the user who put in the lead. Turns
                  green when a picker has already acknowledged it, and shows
                  who; still clickable so master can send a fresh confirm. */}
              <button
                onClick={masterOk}
                disabled={pending}
                title={
                  lead.ackedBy
                    ? `Acknowledged by ${lead.ackedBy.displayName} — tap to confirm to the creator`
                    : "Tap to confirm this lead to its creator"
                }
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold disabled:opacity-60",
                  lead.ackedAt
                    ? "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                    : "border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                )}
              >
                <Check className="h-3 w-3" />
                {masterOkSent
                  ? "OK sent ✓"
                  : lead.ackedBy
                    ? `OK · ${lead.ackedBy.displayName}`
                    : "OK"}
              </button>
            </>
          ) : (
            <button
              onClick={acknowledge}
              disabled={pending || acked || lead.ackedBy?.id === viewer.id}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium",
                acked || lead.ackedBy?.id === viewer.id
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
              )}
            >
              <Check className="h-3 w-3" />
              {acked || lead.ackedBy?.id === viewer.id ? "Seen ✓" : "OK"}
            </button>
          )}

          {/* Personal follow-up reminder. Any user w/ access sets their own; */}
          {/* cron sweeps due rows every 5 min and pushes to the owner. */}
          {/* Panel is portaled to <body> so it can't hide behind another */}
          {/* card in the grid. */}
          <button
            onClick={() => setReminderOpen(true)}
            disabled={pending}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium disabled:opacity-60",
              lead.myReminderAt
                ? "bg-brand-600 text-white shadow-sm hover:bg-brand-700"
                : "border border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
            )}
            title={
              lead.myReminderAt
                ? `Reminder set for ${formatDateTime(lead.myReminderAt)}`
                : "Set a follow-up reminder"
            }
          >
            <BellRing className="h-3 w-3" />
            {lead.myReminderAt
              ? `In ${remindersRemainingLabel(lead.myReminderAt)}`
              : "Remind"}
          </button>
        </div>
      </footer>

      {reminderOpen && (
        <ReminderSheet
          leadId={lead.id}
          currentAt={lead.myReminderAt ?? null}
          hours={reminderHours}
          minutes={reminderMinutes}
          onHoursChange={setReminderHours}
          onMinutesChange={setReminderMinutes}
          onSave={(total) => setReminder(total)}
          onClose={() => setReminderOpen(false)}
        />
      )}

      {error && (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}

      {menuOpen && (
        <StatusMenu
          currentStatus={lead.status}
          onChoose={updateStatus}
          onReset={resetToOpenMarket}
          onClose={() => setMenuOpen(false)}
        />
      )}

      {assignOpen && viewer.role === "MASTER" && (
        <AssignSheet
          lead={lead}
          teamUsers={teamUsers}
          maxPickup={maxPickup}
          onSave={setAssignments}
          onClose={() => setAssignOpen(false)}
          pending={pending}
        />
      )}

      {qualityOpen && (
        <QualityPicker
          current={lead.quality}
          onChoose={setQuality}
          onClose={() => setQualityOpen(false)}
        />
      )}

      {dropOpen && (
        <DropMenu
          currentStatus={lead.status}
          onChoose={dropWithStatus}
          onClose={() => setDropOpen(false)}
        />
      )}

      {reassignOpen && canReassign && (
        <ReassignSheet
          leadId={lead.id}
          targets={reassignTargets ?? []}
          currentChannelUserId={lead.privateChannelUserId ?? null}
          viewerIsMaster={viewer.role === "MASTER"}
          onSubmit={reassign}
          onClose={() => setReassignOpen(false)}
          pending={pending}
        />
      )}
    </article>
  );
}

/* ---------- Drop-with-status menu (portal) ---------- */

/**
 * Forces the user to pick a final status before the assignment is
 * removed. Tapping a status calls dropWithStatusAction which updates the
 * lead's status (if different), deletes the assignment, and increments
 * the user's dropsCount — all in a single transaction.
 */
function DropMenu({
  currentStatus,
  onChoose,
  onClose,
}: {
  currentStatus: LeadStatus;
  onChoose: (s: LeadStatus, note?: string) => void;
  onClose: () => void;
}) {
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  const [rejectReason, setRejectReason] = useState<string | null>(null);
  useEffect(() => {
    setPortalNode(document.body);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!portalNode) return null;

  const handlePick = (status: LeadStatus) => {
    if (status === "REJECTED") {
      setRejectReason("");
      return;
    }
    onChoose(status);
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center">
      <button
        aria-label="Close drop menu"
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm animate-in"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Drop lead with status"
        className="relative w-full md:w-[420px] max-h-[85vh] overflow-y-auto bg-white shadow-lift animate-in rounded-t-2xl md:rounded-2xl pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="md:hidden flex justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-ink-200" aria-hidden />
        </div>

        {rejectReason !== null ? (
          <RejectReasonStep
            value={rejectReason}
            onChange={setRejectReason}
            onBack={() => setRejectReason(null)}
            onConfirm={(text) => onChoose("REJECTED", text)}
            onClose={onClose}
            droppingToo
          />
        ) : (
          <>
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <div>
                <h3 className="text-base font-semibold text-ink-900">Set final status, then drop</h3>
                <p className="text-xs text-ink-500 mt-0.5">
                  Pick the outcome — the lead is dropped from you and tagged with this status.
                </p>
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
                          onClick={() => handlePick(opt.value)}
                          className={
                            "flex items-center justify-between gap-3 rounded-xl border px-3 py-3 text-sm text-left transition-colors " +
                            (isCurrent
                              ? "border-rose-300 bg-rose-50 text-rose-800"
                              : opt.tone === "good"
                                ? "border-ink-100 hover:border-emerald-200 hover:bg-emerald-50 text-emerald-700"
                                : opt.tone === "bad"
                                  ? "border-ink-100 hover:border-rose-200 hover:bg-rose-50 text-rose-700"
                                  : "border-ink-100 hover:border-ink-300 hover:bg-ink-50 text-ink-800")
                          }
                        >
                          <span className="font-medium">{opt.label}</span>
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-ink-500">
                            {isCurrent && <span className="text-rose-700">current</span>}
                            <LogOut className="h-3.5 w-3.5" />
                            drop
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>,
    portalNode
  );
}

/* ---------- Reject-reason step (shared by status menu + drop menu) ---------- */

/**
 * Forced text-entry step shown after the user picks the REJECTED status.
 * Confirm is disabled until the textarea has non-whitespace content.
 * The trimmed value is sent as `note` on the underlying server action,
 * where it's persisted on the LeadStatusChange row for audit history.
 */
function RejectReasonStep({
  value,
  onChange,
  onBack,
  onConfirm,
  onClose,
  droppingToo,
}: {
  value: string;
  onChange: (v: string) => void;
  onBack: () => void;
  onConfirm: (text: string) => void;
  onClose: () => void;
  droppingToo?: boolean;
}) {
  const canSubmit = value.trim().length > 0;
  return (
    <>
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div>
          <h3 className="text-base font-semibold text-ink-900">Why reject?</h3>
          <p className="text-xs text-ink-500 mt-0.5">
            A short reason is required {droppingToo ? "before the lead can be dropped" : "to mark a lead as Rejected"}.
            Saved in the status history for audit.
          </p>
        </div>
        <button
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-full text-ink-500 hover:bg-ink-100"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="px-5 pb-4 space-y-3">
        <textarea
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={5}
          maxLength={500}
          placeholder="e.g. Customer not interested, doesn't qualify, wrong contact info…"
          className="input w-full resize-y text-sm"
        />
        <div className="flex items-center justify-between text-[10px] text-ink-400">
          <span>{value.trim().length === 0 ? "Required" : "Looks good"}</span>
          <span>{value.length}/500</span>
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onBack} className="btn btn-ghost h-9 text-xs">
            Back
          </button>
          <button
            onClick={() => onConfirm(value.trim())}
            disabled={!canSubmit}
            className="btn btn-accent h-9 px-3 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {droppingToo ? "Reject & drop" : "Reject lead"}
          </button>
        </div>
      </div>
    </>
  );
}

/* ---------- Status menu (portal) ---------- */

function StatusMenu({
  currentStatus,
  onChoose,
  onReset,
  onClose,
}: {
  currentStatus: LeadStatus;
  onChoose: (s: LeadStatus, note?: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  const [rejectReason, setRejectReason] = useState<string | null>(null);
  useEffect(() => {
    setPortalNode(document.body);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handlePick = (status: LeadStatus) => {
    if (status === "REJECTED") {
      setRejectReason("");
      return;
    }
    onChoose(status);
  };

  if (!portalNode) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center">
      <button
        aria-label="Close status menu"
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm animate-in"
      />
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

        {rejectReason !== null ? (
          <RejectReasonStep
            value={rejectReason}
            onChange={setRejectReason}
            onBack={() => setRejectReason(null)}
            onConfirm={(text) => onChoose("REJECTED", text)}
            onClose={onClose}
          />
        ) : (
          <>
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
                          onClick={() => handlePick(opt.value)}
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

              <div className="border-t border-ink-100 mt-4 pt-3 px-1 space-y-1">
                <button
                  onClick={onReset}
                  className="w-full rounded-xl border border-brand-200 bg-brand-50 px-3 py-3 text-left text-sm font-bold text-brand-700 hover:bg-brand-100"
                >
                  Reset to Open Market
                </button>
                <button
                  onClick={() => onChoose("RECYCLED")}
                  className="w-full rounded-xl border border-brand-200 bg-brand-50 px-3 py-3 text-left text-sm font-bold text-brand-700 hover:bg-brand-100"
                >
                  Recycle to Archive
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    portalNode
  );
}

/* ---------- Master-only assign sheet (portal) ---------- */

function AssignSheet({
  lead,
  teamUsers,
  maxPickup,
  onSave,
  onClose,
  pending,
}: {
  lead: Lead;
  teamUsers: { id: number; displayName: string }[];
  maxPickup: number;
  onSave: (userIds: number[]) => void;
  onClose: () => void;
  pending: boolean;
}) {
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(lead.assignees.map((a) => a.id))
  );

  useEffect(() => {
    setPortalNode(document.body);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!portalNode) return null;

  const toggle = (id: number) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const overCap = selected.size > maxPickup;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center">
      <button
        aria-label="Close assignment menu"
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm animate-in"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Assign lead"
        className="relative w-full md:w-[440px] max-h-[85vh] overflow-y-auto bg-white shadow-lift animate-in rounded-t-2xl md:rounded-2xl pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="md:hidden flex justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-ink-200" aria-hidden />
        </div>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div>
            <h3 className="text-base font-semibold text-ink-900">Assign lead #{lead.id}</h3>
            <p className="text-xs text-ink-500 mt-0.5">
              Master override — bypasses the {maxPickup}-pickup cap, but you can warn yourself.
            </p>
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
          {teamUsers.length === 0 ? (
            <p className="text-sm text-ink-500 px-3 py-6 text-center">
              No active users yet. Add some on the Team page.
            </p>
          ) : (
            <ul className="space-y-1 px-1">
              {teamUsers.map((u) => {
                const checked = selected.has(u.id);
                return (
                  <li key={u.id}>
                    <button
                      onClick={() => toggle(u.id)}
                      className={
                        "w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-3 text-sm text-left transition-colors " +
                        (checked
                          ? "border-brand-300 bg-brand-50 text-brand-800"
                          : "border-ink-100 hover:border-ink-300 hover:bg-ink-50 text-ink-800")
                      }
                    >
                      <span className="font-medium">{u.displayName}</span>
                      <span
                        className={cn(
                          "grid h-5 w-5 place-items-center rounded-md border",
                          checked ? "border-brand-500 bg-brand-500 text-white" : "border-ink-300"
                        )}
                      >
                        {checked && <Check className="h-3 w-3" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {overCap && (
            <p className="mt-3 mx-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              You&apos;re assigning {selected.size} users — that&apos;s above the {maxPickup}-pickup
              setting. Saving will still work (master override), but you may want to bump
              the limit in Admin settings.
            </p>
          )}

          <div className="mt-4 flex items-center justify-end gap-2 px-1">
            <button onClick={onClose} disabled={pending} className="btn btn-ghost h-9 text-xs">
              Cancel
            </button>
            <button
              onClick={() => onSave(Array.from(selected))}
              disabled={pending}
              className="btn btn-primary h-9 px-3 text-xs"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Save assignment
            </button>
          </div>
        </div>
      </div>
    </div>,
    portalNode
  );
}

/* ---------- Private-channel reassign sheet (portal) ---------- */

function ReassignSheet({
  leadId,
  targets,
  currentChannelUserId,
  viewerIsMaster,
  onSubmit,
  onClose,
  pending,
}: {
  leadId: number;
  targets: { id: number; displayName: string; isPrivateChannel?: boolean }[];
  currentChannelUserId: number | null;
  viewerIsMaster: boolean;
  onSubmit: (targetUserId: number, remark: string) => void;
  onClose: () => void;
  pending: boolean;
}) {
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  // 0 = "send to master / public pool"; any positive id = a private user.
  const [targetId, setTargetId] = useState<number>(0);
  const [remark, setRemark] = useState<string>("");

  useEffect(() => {
    setPortalNode(document.body);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!portalNode) return null;

  const canSubmit = remark.trim().length > 0;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center">
      <button
        aria-label="Close reassign menu"
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm animate-in"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Reassign lead"
        className="relative w-full md:w-[440px] max-h-[85vh] overflow-y-auto bg-white shadow-lift animate-in rounded-t-2xl md:rounded-2xl pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="md:hidden flex justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-ink-200" aria-hidden />
        </div>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div>
            <h3 className="text-base font-semibold text-ink-900">Reassign lead #{leadId}</h3>
            <p className="text-xs text-ink-500 mt-0.5">
              Hand the lead to another private pipeline or master&apos;s private inbox.
              A handover remark is required.
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-ink-500 hover:bg-ink-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pb-4 space-y-3">
          <div>
            <label className="label">Send to</label>
            <select
              value={targetId}
              onChange={(e) => setTargetId(Number(e.target.value))}
              className="input h-11"
            >
              {viewerIsMaster && currentChannelUserId !== null && (
                <option value={-1}>Public pool (everyone sees it)</option>
              )}
              <option value={0}>Master (private inbox)</option>
              {targets.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName} {u.isPrivateChannel ? "(private)" : "(team)"}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-ink-500">
              {viewerIsMaster
                ? "Master can move a lead to any pipeline."
                : "Stays private until status moves to Open Market."}
            </p>
          </div>
          <div>
            <label className="label">Handover remark <span className="text-rose-600">*</span></label>
            <textarea
              autoFocus
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              rows={5}
              maxLength={2000}
              placeholder="What's the situation? Anything the next person needs to know…"
              className="input w-full resize-y text-sm"
            />
            <div className="flex items-center justify-between text-[10px] text-ink-400 mt-1">
              <span>{remark.trim().length === 0 ? "Required" : "Looks good"}</span>
              <span>{remark.length}/2000</span>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button onClick={onClose} disabled={pending} className="btn btn-ghost h-9 text-xs">
              Cancel
            </button>
            <button
              onClick={() => onSubmit(targetId, remark.trim())}
              disabled={!canSubmit || pending}
              className="btn btn-primary h-9 px-3 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Reassign
            </button>
          </div>
        </div>
      </div>
    </div>,
    portalNode
  );
}

/**
 * Compact mini-modal for setting a personal follow-up reminder.
 * Rendered via createPortal at document.body so nothing in the lead-card
 * grid can ever occlude it.
 */
function ReminderSheet({
  leadId,
  currentAt,
  hours,
  minutes,
  onHoursChange,
  onMinutesChange,
  onSave,
  onClose,
}: {
  leadId: number;
  currentAt: string | null;
  hours: number;
  minutes: number;
  onHoursChange: (h: number) => void;
  onMinutesChange: (m: number) => void;
  onSave: (totalMinutes: number) => void;
  onClose: () => void;
}) {
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

  const total = hours * 60 + minutes;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center">
      <button
        aria-label="Close reminder menu"
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm animate-in"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Set reminder"
        className="relative w-full md:w-[360px] bg-white shadow-lift animate-in rounded-t-2xl md:rounded-2xl pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="md:hidden flex justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-ink-200" aria-hidden />
        </div>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div>
            <h3 className="text-base font-semibold text-ink-900">
              Remind me — lead #{leadId}
            </h3>
            <p className="text-xs text-ink-500 mt-0.5">
              You&apos;ll get a push when the time is up.
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-ink-500 hover:bg-ink-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pb-5">
          <div className="flex items-center gap-3">
            <label className="flex-1">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1">
                Hours
              </span>
              <select
                value={hours}
                onChange={(e) => onHoursChange(Number(e.target.value))}
                className="w-full h-11 rounded-md border border-ink-200 bg-white px-2 text-sm text-ink-800"
              >
                {[0, 1, 2, 3, 4].map((h) => (
                  <option key={h} value={h}>
                    {h} h
                  </option>
                ))}
              </select>
            </label>
            <label className="flex-1">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1">
                Minutes
              </span>
              <select
                value={minutes}
                onChange={(e) => onMinutesChange(Number(e.target.value))}
                className="w-full h-11 rounded-md border border-ink-200 bg-white px-2 text-sm text-ink-800"
              >
                {[0, 15, 30, 45].map((m) => (
                  <option key={m} value={m}>
                    {m} m
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            onClick={() => {
              if (total <= 0) return;
              onSave(total);
            }}
            disabled={total <= 0}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <BellRing className="h-4 w-4" />
            Set reminder
          </button>
          {currentAt && (
            <button
              onClick={() => onSave(0)}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
            >
              <X className="h-4 w-4" />
              Clear reminder
            </button>
          )}
        </div>
      </div>
    </div>,
    portalNode
  );
}
