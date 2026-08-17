"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
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
  Users,
  Check,
  ArrowRight,
  Send,
  BellRing,
  Copy,
  Phone,
  MessageCircle,
  Pencil,
  Tag,
  Plus,
  MapPin,
  Trash2,
} from "lucide-react";
import { STATUS_GROUPS } from "@/lib/leadStatus";
import { timeAgo, daysAgo, formatDateTime, waNumber, cn } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import { QualityBadge, QualityPicker } from "./QualityPicker";
import { LeadRemarkThread } from "./LeadRemarkThread";
import {
  changeStatusAction,
  pickUpLeadAction,
  setLeadAssignmentsAction,
  updateLeadQualityAction,
  resetToOpenMarketAction,
  reassignPrivateLeadAction,
  setContactStateAction,
  pingLeadAction,
  okPickLeadAction,
  masterOkLeadAction,
  setReminderAction,
  setLeadPhoneAction,
  setLeadNameAction,
  setLeadSourceAction,
  addLeadSourceAction,
  listLeadSourcesAction,
  deleteLeadSourceAction,
  deleteLeadLocationAction,
  setLeadLocationAction,
  addLeadLocationAction,
  listLeadLocationsAction,
  listLeadRemarksAction,
} from "@/app/dashboard/actions";
import Link from "next/link";

type Lead = {
  id: number;
  content: string;
  name?: string | null;
  phone?: string | null;
  source?: { id: number; name: string } | null;
  location?: { id: number; name: string } | null;
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

type SheetRemark = Awaited<ReturnType<typeof listLeadRemarksAction>>[number];

const CONTACT_STATE_OPTIONS: { value: string; label: string }[] = [
  { value: "NEW", label: "New" },
  { value: "CALLED_BEFORE", label: "Called Before" },
  { value: "WHATSAPP_BEFORE", label: "WhatsApp Before" },
];

function contactStateLabel(state: string | undefined): string {
  const hit = CONTACT_STATE_OPTIONS.find((o) => o.value === state);
  return hit?.label ?? "New";
}

/** "45m", "2h", "3d 4h" — best-effort short label of time until remindAt. */
function remindersRemainingLabel(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "now";
  const totalMinutes = Math.floor(ms / 60_000);
  const d = Math.floor(totalMinutes / 1440);
  const h = Math.floor((totalMinutes % 1440) / 60);
  const m = totalMinutes % 60;
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
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
  const [qualityOpen, setQualityOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [contactStateOpen, setContactStateOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderDays, setReminderDays] = useState(0);
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
    if (!menuOpen && !qualityOpen && !reassignOpen && !reminderOpen && !detailsOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen, qualityOpen, reassignOpen, reminderOpen, detailsOpen]);

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

  /**
   * Combined "OK / Pick" — the old Pick up button folded into OK. In one
   * tap it picks the lead up (when the viewer isn't already an assignee and
   * has capacity) and then sends the role-appropriate acknowledgement:
   * master notifies the lead's creator, everyone else notifies master.
   */
  const okPick = () => {
    setError(null);
    const shouldPick = !iAmAssigned && !(atCapacity && viewer.role !== "MASTER");
    startTransition(async () => {
      const fd = new FormData();
      fd.set("leadId", String(lead.id));
      if (viewer.role === "MASTER") {
        if (shouldPick) {
          const res = await pickUpLeadAction(fd);
          if (res?.error) {
            setError(res.error);
            return;
          }
        }
        const res = await masterOkLeadAction(fd);
        if (res?.error) {
          setError(res.error);
          return;
        }
        setMasterOkSent(true);
        setTimeout(() => setMasterOkSent(false), 1500);
      } else {
        // Single action does pickup + acknowledge and sends ONE "seen and
        // picked up" notification instead of two.
        const res = await okPickLeadAction(fd);
        if (res?.error) {
          setError(res.error);
          return;
        }
        setAcked(true);
      }
    });
  };

  const setAssignments = (userIds: number[]) => {
    setError(null);
    startTransition(async () => {
      const res = await setLeadAssignmentsAction({ leadId: lead.id, userIds });
      if (res?.error) setError(res.error);
      // Assignment now lives inside the combined Assign sheet — close it on
      // success so the save reads as done.
      else setReassignOpen(false);
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
    <article className="card p-3 md:p-4 hover:shadow-lift transition-shadow group flex flex-col">
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

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-brand-200 bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-100"
          >
            Details
            <ArrowRight className="h-3 w-3" />
          </button>
          <button
            onClick={() => setMenuOpen(true)}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-2 py-1 text-[11px] font-medium text-ink-700 hover:bg-ink-50"
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Status"}
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>
      </header>

      {/* Source + Location + Name + Phone rows. On phones, Source and
          Location share one row (side by side) to save height; on md+ they
          stack. Rows always render so empty fields can still be set. */}
      <div className="mt-2 md:mt-3 rounded-lg border border-ink-100 bg-white text-[12px] overflow-hidden">
        <div className="flex md:block">
          <div className="flex-1 min-w-0 border-b border-r md:border-r-0 border-ink-100">
            <SourceRow leadId={lead.id} source={lead.source ?? null} canManage={viewer.role === "MASTER"} />
          </div>
          <div className="flex-1 min-w-0 border-b border-ink-100">
            <LocationRow leadId={lead.id} location={lead.location ?? null} canManage={viewer.role === "MASTER"} />
          </div>
        </div>
        <div className="border-b border-ink-100">
          <ContactRow leadId={lead.id} label="Name" value={lead.name ?? ""} editable />
        </div>
        {(lead.phone || extractPhone(lead.content)) && (
          <ContactRow
            leadId={lead.id}
            label="Phone"
            value={lead.phone || extractPhone(lead.content) || ""}
            phone
            editable
          />
        )}
      </div>

      {/* "Details" opens the full lead in a floating window — the button
          lives in the header now, keeping the card short. */}

      {lead.remark && (
        <Link
          href={`/dashboard/leads/${lead.id}`}
          className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"
        >
          <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
          <p className="break-words text-[12px] leading-relaxed text-amber-900">
            {lead.remark}
          </p>
        </Link>
      )}

      {/* Assignees row */}
      <div className="mt-2 md:mt-3 flex flex-wrap items-center gap-1.5">
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

      <footer className="mt-2 md:mt-3 space-y-1.5 md:space-y-2 text-[11px] text-ink-500">
        {/* Meta: one wrapping line on mobile (From · date · aging · updated);
            roomier on desktop. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex items-center gap-1 min-w-0">
            <UserCircle2 className="h-3 w-3 shrink-0" />
            <span className="break-words"><strong className="text-ink-700">{lead.createdBy?.displayName ?? "—"}</strong></span>
          </span>
          <span className="hidden md:inline text-ink-300">·</span>
          {/* Full created date is desktop-only; the aging pill below already
              signals recency on a phone, saving a wrapped line. */}
          <span className="hidden md:inline-flex items-center gap-1">
            <Calendar className="h-3 w-3 shrink-0" />
            <span className="whitespace-nowrap">{formatDateTime(lead.createdAt)}</span>
          </span>
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
          <span className="ml-auto text-ink-400">Updated {timeAgo(lead.updatedAt)}</span>
        </div>

        {/* Action bar — one row, equal-width buttons that share the space so
            every action stays visible without horizontal scrolling. Labels
            never clip — every label reads in full. */}
        <div className="flex items-center gap-1 pt-1">
          {/* OK / Pick — picks the lead up (if not already yours) and sends
              the acknowledgement in one tap. */}
          <button
            onClick={okPick}
            disabled={pending || (!iAmAssigned && atCapacity && viewer.role !== "MASTER")}
            title={
              iAmAssigned
                ? "Acknowledge this lead"
                : "Pick up this lead and acknowledge it"
            }
            className={cn(
              "inline-flex h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-1.5 text-[11px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed",
              acked || masterOkSent || lead.ackedAt
                ? "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                : "border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
            )}
          >
            <Check className="h-3 w-3 shrink-0" />
            <span className="whitespace-nowrap">
              {masterOkSent
                ? "Sent"
                : acked
                  ? "Seen"
                  : !iAmAssigned && atCapacity && viewer.role !== "MASTER"
                    ? "Full"
                    : iAmAssigned
                      ? "OK"
                      : "OK/Pick"}
            </span>
          </button>

          {/* No Drop button — releasing a lead happens via the Status menu
              ("Reset to Open Market" / "Recycle to Archive"), both of which
              clear every assignee so anyone can pick it up again. */}

          {/* One button covers both jobs now: assigning team members and
              moving the lead between pipelines. */}
          {canReassign && (
            <button
              onClick={() => setReassignOpen(true)}
              disabled={pending}
              title="Assign or move to a pipeline"
              className="inline-flex h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded-md border border-violet-200 bg-white px-1.5 text-[11px] font-medium text-violet-700 hover:bg-violet-50"
            >
              <Send className="h-3 w-3 shrink-0" />
              <span className="whitespace-nowrap">Assign</span>
            </button>
          )}

          {viewer.role === "MASTER" && (
            <button
              onClick={ping}
              disabled={pending}
              title="Ping the people responsible"
              className="inline-flex h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded-md border border-amber-200 bg-white px-1.5 text-[11px] font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-60"
            >
              <BellRing className="h-3 w-3 shrink-0" />
              <span className="whitespace-nowrap">{pinged ? "Sent" : "Ping"}</span>
            </button>
          )}

          {/* Personal follow-up reminder. Any user w/ access sets their own;
              cron sweeps due rows and pushes to the owner. */}
          <button
            onClick={() => setReminderOpen(true)}
            disabled={pending}
            className={cn(
              "inline-flex h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-1.5 text-[11px] font-medium disabled:opacity-60",
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
            <BellRing className="h-3 w-3 shrink-0" />
            <span className="whitespace-nowrap">
              {lead.myReminderAt
                ? remindersRemainingLabel(lead.myReminderAt)
                : "Remind"}
            </span>
          </button>
        </div>
      </footer>

      {detailsOpen && (
        <LeadDetailsSheet
          lead={lead}
          viewerId={viewer.id}
          onClose={() => setDetailsOpen(false)}
        />
      )}

      {reminderOpen && (
        <ReminderSheet
          leadId={lead.id}
          currentAt={lead.myReminderAt ?? null}
          days={reminderDays}
          hours={reminderHours}
          minutes={reminderMinutes}
          onDaysChange={setReminderDays}
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

      {qualityOpen && (
        <QualityPicker
          current={lead.quality}
          onChoose={setQuality}
          onClose={() => setQualityOpen(false)}
        />
      )}

      {reassignOpen && canReassign && (
        <ReassignSheet
          leadId={lead.id}
          targets={reassignTargets ?? []}
          currentChannelUserId={lead.privateChannelUserId ?? null}
          viewerIsMaster={viewer.role === "MASTER"}
          teamUsers={teamUsers}
          currentAssigneeIds={lead.assignees.map((a) => a.id)}
          maxPickup={maxPickup}
          onSaveAssignees={setAssignments}
          onSubmit={reassign}
          onClose={() => setReassignOpen(false)}
          pending={pending}
        />
      )}
    </article>
  );
}

/* ---------- Reject-reason step (used by the status menu) ---------- */

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
  title,
  description,
  placeholder,
  confirmLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  onBack: () => void;
  onConfirm: (text: string) => void;
  onClose: () => void;
  droppingToo?: boolean;
  title?: string;
  description?: React.ReactNode;
  placeholder?: string;
  confirmLabel?: string;
}) {
  const canSubmit = value.trim().length > 0;
  return (
    <>
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div>
          <h3 className="text-base font-semibold text-ink-900">{title ?? "Why reject?"}</h3>
          <p className="text-xs text-ink-500 mt-0.5">
            {description ?? (
              <>
                A short reason is required {droppingToo ? "before the lead can be dropped" : "to mark a lead as Rejected"}.
                Saved in the status history for audit.
              </>
            )}
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
          placeholder={placeholder ?? "e.g. Customer not interested, doesn't qualify, wrong contact info…"}
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
            {confirmLabel ?? (droppingToo ? "Reject & drop" : "Reject lead")}
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
  const [recycleReason, setRecycleReason] = useState<string | null>(null);
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

        {recycleReason !== null ? (
          <RejectReasonStep
            value={recycleReason}
            onChange={setRecycleReason}
            onBack={() => setRecycleReason(null)}
            onConfirm={(text) => onChoose("RECYCLED", text)}
            onClose={onClose}
            title="Move to Recycle Bin"
            description="Add a remark saying why — it's saved to the lead's remarks so anyone opening the details can see it."
            placeholder="e.g. Duplicate, bad number, revisit next quarter…"
            confirmLabel="Recycle lead"
          />
        ) : rejectReason !== null ? (
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
                  onClick={() => setRecycleReason("")}
                  className="w-full rounded-xl border border-brand-200 bg-brand-50 px-3 py-3 text-left text-sm font-bold text-brand-700 hover:bg-brand-100"
                >
                  Move to Recycle Bin
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

/* ---------- Private-channel reassign sheet (portal) ---------- */

function ReassignSheet({
  leadId,
  targets,
  currentChannelUserId,
  viewerIsMaster,
  teamUsers,
  currentAssigneeIds,
  maxPickup,
  onSaveAssignees,
  onSubmit,
  onClose,
  pending,
}: {
  leadId: number;
  targets: { id: number; displayName: string; isPrivateChannel?: boolean }[];
  currentChannelUserId: number | null;
  viewerIsMaster: boolean;
  teamUsers: { id: number; displayName: string }[];
  currentAssigneeIds: number[];
  maxPickup: number;
  onSaveAssignees: (userIds: number[]) => void;
  onSubmit: (targetUserId: number, remark: string) => void;
  onClose: () => void;
  pending: boolean;
}) {
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  // 0 = "send to master / public pool"; any positive id = a private user.
  const [targetId, setTargetId] = useState<number>(0);
  const [remark, setRemark] = useState<string>("");
  // Master-only inline assignment (folded in from the old Assign button).
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(currentAssigneeIds)
  );
  const toggleAssignee = (id: number) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const assigneesChanged =
    selected.size !== currentAssigneeIds.length ||
    currentAssigneeIds.some((id) => !selected.has(id));

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
            <h3 className="text-base font-semibold text-ink-900">Assign lead #{leadId}</h3>
            <p className="text-xs text-ink-500 mt-0.5">
              {viewerIsMaster
                ? "Assign team members, or hand the lead to another pipeline."
                : "Hand the lead to another pipeline or master's private inbox."}
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
          {/* Assign team members — folded in from the old separate Assign
              button. Master override: bypasses the pickup cap. */}
          {viewerIsMaster && teamUsers.length > 0 && (
            <div className="rounded-lg border border-ink-200 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-700">
                <Users className="h-3.5 w-3.5 text-brand-600" />
                Assign to team
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {teamUsers.map((u) => {
                  const checked = selected.has(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleAssignee(u.id)}
                      disabled={pending}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-60",
                        checked
                          ? "border-brand-500 bg-brand-500 text-white"
                          : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
                      )}
                    >
                      {checked && <Check className="h-3 w-3" />}
                      {u.displayName}
                    </button>
                  );
                })}
              </div>
              {selected.size > maxPickup && (
                <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-800">
                  {selected.size} assignees — above the {maxPickup}-pickup limit. Saving still
                  works (master override).
                </p>
              )}
              <button
                type="button"
                onClick={() => onSaveAssignees(Array.from(selected))}
                disabled={pending || !assigneesChanged}
                className="btn btn-primary mt-2 h-8 px-3 text-xs disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Save assignment
              </button>
            </div>
          )}

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
            <label className="label">Handover remark <span className="font-normal normal-case text-ink-400">(optional)</span></label>
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
              <span>Optional</span>
              <span>{remark.length}/2000</span>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button onClick={onClose} disabled={pending} className="btn btn-ghost h-9 text-xs">
              Cancel
            </button>
            <button
              onClick={() => onSubmit(targetId, remark.trim())}
              disabled={pending}
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
  days,
  hours,
  minutes,
  onDaysChange,
  onHoursChange,
  onMinutesChange,
  onSave,
  onClose,
}: {
  leadId: number;
  currentAt: string | null;
  days: number;
  hours: number;
  minutes: number;
  onDaysChange: (d: number) => void;
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

  const total = days * 1440 + hours * 60 + minutes;

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
                Days
              </span>
              <select
                value={days}
                onChange={(e) => onDaysChange(Number(e.target.value))}
                className="w-full h-11 rounded-md border border-ink-200 bg-white px-2 text-sm text-ink-800"
              >
                {Array.from({ length: 31 }, (_, d) => (
                  <option key={d} value={d}>
                    {d} d
                  </option>
                ))}
              </select>
            </label>
            <label className="flex-1">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1">
                Hours
              </span>
              <select
                value={hours}
                onChange={(e) => onHoursChange(Number(e.target.value))}
                className="w-full h-11 rounded-md border border-ink-200 bg-white px-2 text-sm text-ink-800"
              >
                {Array.from({ length: 24 }, (_, h) => (
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

/**
 * Structured contact rows at the top of a lead card: Name / IC / Phone.
 * Only rows with a value render. Every value has a Copy button; phone
 * additionally gets Call (tel:) and WhatsApp (wa.me) buttons.
 */
/**
 * Best-effort phone extraction from a free-text blob (Gmail body, etc.).
 * Matches common Malaysian mobile shapes with country code or leading 0.
 * Returns null when nothing convincing turns up so the ContactRows band
 * doesn't render an empty phone row.
 */
function extractPhone(text: string): string | null {
  const m = text.match(/(?:\+?60|0)[\s-]?\d{1,2}[\s-]?\d{3,4}[\s-]?\d{4}/);
  return m?.[0] ?? null;
}

function ContactRow({
  leadId,
  label,
  value,
  phone,
  editable,
}: {
  leadId: number;
  label: string;
  value: string;
  phone?: boolean;
  editable?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, startSave] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };
  // Digits-only for tel: (local form); wa.me needs the 60 country code.
  const digits = phone ? value.replace(/\D+/g, "") : "";
  const wa = phone ? waNumber(value) : "";

  const save = () => {
    setSaveError(null);
    const fd = new FormData();
    fd.set("leadId", String(leadId));
    const isName = label === "Name";
    fd.set(isName ? "name" : "phone", draft.trim());
    startSave(async () => {
      const res = isName
        ? await setLeadNameAction(fd)
        : await setLeadPhoneAction(fd);
      if (res?.error) {
        setSaveError(res.error);
        return;
      }
      setEditing(false);
    });
  };

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 px-2.5 py-1 md:py-1.5">
        <span className="w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
          {label}
        </span>
        <input
          type={label === "Phone" ? "tel" : "text"}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
              setSaveError(null);
            }
          }}
          disabled={saving}
          className="flex-1 min-w-0 rounded-md border border-ink-200 bg-white px-2 py-1 text-[12px] text-ink-800"
          placeholder={label === "Phone" ? "+60 12-345 6789" : "Full name"}
        />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="grid h-7 w-7 place-items-center rounded-md border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
          title="Save"
          aria-label="Save phone"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(value);
            setEditing(false);
            setSaveError(null);
          }}
          disabled={saving}
          className="grid h-7 w-7 place-items-center rounded-md border border-ink-200 bg-white text-ink-600 hover:bg-ink-50 disabled:opacity-60"
          title="Cancel"
          aria-label="Cancel edit"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        {saveError && (
          <span className="w-full text-[11px] text-rose-600">{saveError}</span>
        )}
      </div>
    );
  }

  const copyBtn = (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "grid h-7 w-7 place-items-center rounded-md border text-[11px] transition-colors",
        copied
          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
          : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
      )}
      title={copied ? "Copied ✓" : `Copy ${label.toLowerCase()}`}
      aria-label={`Copy ${label}`}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );

  const phoneBtns = phone && digits && (
    <>
      <a
        href={`tel:${digits}`}
        className="grid h-7 w-7 place-items-center rounded-md border border-brand-200 bg-white text-brand-700 hover:bg-brand-50"
        title="Call"
        aria-label="Call this number"
      >
        <Phone className="h-3.5 w-3.5" />
      </a>
      <a
        href={`https://wa.me/${wa}`}
        target="_blank"
        rel="noopener noreferrer"
        className="grid h-7 w-7 place-items-center rounded-md border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
        title="Open in WhatsApp"
        aria-label="WhatsApp this number"
      >
        <MessageCircle className="h-3.5 w-3.5" />
      </a>
    </>
  );

  const editBtn = editable && (
    <button
      type="button"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className="grid h-7 w-7 place-items-center rounded-md border border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
      title={`Edit ${label.toLowerCase()}`}
      aria-label={`Edit ${label}`}
    >
      <Pencil className="h-3.5 w-3.5" />
    </button>
  );

  // Phone row: number and its actions sit on ONE line so the row stays
  // compact. A long value wraps to the next line; the buttons never wrap.
  if (phone) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 md:py-1.5">
        <span className="w-9 md:w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
          {label}
        </span>
        <span className="flex-1 min-w-0 break-words text-ink-800 font-medium">{value}</span>
        <span className="flex shrink-0 items-center gap-1">
          {copyBtn}
          {phoneBtns}
          {editBtn}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 md:py-1.5">
      <span className="w-9 md:w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
        {label}
      </span>
      {value ? (
        <span className="flex-1 min-w-0 break-words text-ink-800">{value}</span>
      ) : (
        <span className="flex-1 min-w-0 text-[11px] italic text-ink-400">Tap to set…</span>
      )}
      <span className="flex shrink-0 items-center gap-1">
        {value && copyBtn}
        {editBtn}
      </span>
    </div>
  );
}

/**
 * Floating lead detail window. Replaces navigating to /dashboard/leads/[id]
 * for a quick look — shows every field we already have on the card plus the
 * full (unclipped) content plus the remark thread, which is fetched on open
 * rather than shipped with every card. A link to the full page remains for
 * the status history.
 */
function LeadDetailsSheet({
  lead,
  viewerId,
  onClose,
}: {
  lead: Lead;
  viewerId: number;
  onClose: () => void;
}) {
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  const [remarks, setRemarks] = useState<SheetRemark[] | null>(null);
  useEffect(() => {
    setPortalNode(document.body);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const loadRemarks = useCallback(() => {
    listLeadRemarksAction(lead.id).then(setRemarks);
  }, [lead.id]);
  useEffect(loadRemarks, [loadRemarks]);

  if (!portalNode) return null;

  const phoneValue = lead.phone || extractPhone(lead.content) || "";
  const digits = phoneValue.replace(/\D+/g, "");
  const wa = waNumber(phoneValue);

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex gap-3 py-1.5">
      <span className="w-20 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
        {label}
      </span>
      <span className="flex-1 min-w-0 text-[12px] text-ink-800">{children}</span>
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center">
      <button
        aria-label="Close lead details"
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm animate-in"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Lead #${lead.id} details`}
        className="relative w-full md:w-[520px] max-h-[88vh] flex flex-col bg-white shadow-lift animate-in rounded-t-2xl md:rounded-2xl pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="md:hidden flex justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-ink-200" aria-hidden />
        </div>
        <div className="flex items-start justify-between gap-2 px-5 pt-4 pb-2 border-b border-ink-100">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StatusBadge status={lead.status} />
              <span className="text-[11px] text-ink-400">#{lead.id}</span>
            </div>
            <h3 className="mt-1 break-words text-base font-semibold text-ink-900">
              {lead.name || "Lead details"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-500 hover:bg-ink-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-3">
          <div className="divide-y divide-ink-100">
            {lead.name && <Row label="Name">{lead.name}</Row>}
            {phoneValue && (
              <Row label="Phone">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{phoneValue}</span>
                  {digits && (
                    <span className="flex items-center gap-1">
                      <a
                        href={`tel:${digits}`}
                        className="grid h-7 w-7 place-items-center rounded-md border border-brand-200 bg-white text-brand-700 hover:bg-brand-50"
                        aria-label="Call"
                      >
                        <Phone className="h-3.5 w-3.5" />
                      </a>
                      <a
                        href={`https://wa.me/${wa}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="grid h-7 w-7 place-items-center rounded-md border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                        aria-label="WhatsApp"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </a>
                    </span>
                  )}
                </span>
              </Row>
            )}
            {lead.source && <Row label="Source">{lead.source.name}</Row>}
            {lead.location && <Row label="Location">{lead.location.name}</Row>}
            <Row label="Added by">{lead.createdBy?.displayName ?? "—"}</Row>
            <Row label="Created">{formatDateTime(lead.createdAt)}</Row>
            <Row label="Updated">{timeAgo(lead.updatedAt)}</Row>
            <Row label="Assigned">
              {lead.assignees.length === 0 ? (
                <span className="italic text-ink-400">Nobody picked up yet</span>
              ) : (
                lead.assignees.map((a) => a.displayName).join(", ")
              )}
            </Row>
          </div>

          {lead.remark && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
              <p className="text-[12px] leading-relaxed text-amber-900">{lead.remark}</p>
            </div>
          )}

          <div className="mt-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
              Full lead
            </div>
            <pre className="mt-1.5 whitespace-pre-wrap break-words rounded-lg bg-ink-50 p-3 text-[12px] leading-relaxed text-ink-800 font-mono">
{lead.content}
            </pre>
          </div>

          <div className="mt-4 border-t border-ink-100 pt-3">
            {remarks === null ? (
              <p className="text-[12px] text-ink-400">Loading remarks…</p>
            ) : (
              <LeadRemarkThread
                leadId={lead.id}
                viewerId={viewerId}
                remarks={remarks}
                variant="sheet"
                onChanged={loadRemarks}
              />
            )}
          </div>
        </div>

        <div className="border-t border-ink-100 px-5 py-3">
          <Link
            href={`/dashboard/leads/${lead.id}`}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand-700 hover:underline"
          >
            Open full page for history
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>,
    portalNode
  );
}

/**
 * Source row: shows the current source (e.g. "Ezy" / "FB") on top of the
 * name/phone rows. Tapping opens a portal picker with every existing
 * source + "Add new" affordance that persists a fresh option for the team.
 */
function SourceRow({
  leadId,
  source,
  canManage,
}: {
  leadId: number;
  source: { id: number; name: string } | null;
  canManage?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1.5 md:gap-2 px-2 py-1 md:px-2.5 md:py-1.5 text-left hover:bg-ink-50"
      >
        <span className="w-9 md:w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
          Src
        </span>
        <span className="flex-1 min-w-0">
          {source ? (
            <span className="inline-flex max-w-full items-start gap-1 rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-semibold leading-tight text-brand-700 ring-1 ring-brand-200">
              <Tag className="h-3 w-3 shrink-0" />
              <span className="break-words">{source.name}</span>
            </span>
          ) : (
            <span className="text-[11px] italic text-ink-400">Tap…</span>
          )}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-400" />
      </button>
      {open && (
        <SourcePicker
          leadId={leadId}
          currentSourceId={source?.id ?? null}
          canManage={canManage}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function SourcePicker({
  leadId,
  currentSourceId,
  canManage,
  onClose,
}: {
  leadId: number;
  currentSourceId: number | null;
  canManage?: boolean;
  onClose: () => void;
}) {
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  const [sources, setSources] = useState<{ id: number; name: string }[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const removeSource = (id: number, name: string) => {
    if (!confirm(`Delete source "${name}"? It will be cleared from any leads using it.`)) return;
    setError(null);
    const fd = new FormData();
    fd.set("id", String(id));
    startTransition(async () => {
      const res = await deleteLeadSourceAction(fd);
      if (res?.error) setError(res.error);
      else setSources((prev) => (prev ?? []).filter((s) => s.id !== id));
    });
  };

  useEffect(() => {
    setPortalNode(document.body);
    listLeadSourcesAction()
      .then(setSources)
      .catch(() => setSources([]));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!portalNode) return null;

  const pick = (sourceId: number) => {
    setError(null);
    const fd = new FormData();
    fd.set("leadId", String(leadId));
    fd.set("sourceId", String(sourceId));
    startTransition(async () => {
      const res = await setLeadSourceAction(fd);
      if (res?.error) setError(res.error);
      else onClose();
    });
  };

  const saveNew = () => {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    const fd = new FormData();
    fd.set("name", name);
    startTransition(async () => {
      const res = await addLeadSourceAction(fd);
      if (!res || res.error || !res.sourceId) {
        setError(res?.error ?? "Could not add source.");
        return;
      }
      // Add to local list so it appears immediately, then select it.
      setSources((prev) => [...(prev ?? []), { id: res.sourceId!, name }]);
      pick(res.sourceId);
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center">
      <button
        aria-label="Close source picker"
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm animate-in"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pick lead source"
        className="relative w-full md:w-[360px] bg-white shadow-lift animate-in rounded-t-2xl md:rounded-2xl pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="md:hidden flex justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-ink-200" aria-hidden />
        </div>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div>
            <h3 className="text-base font-semibold text-ink-900">Where is this lead from?</h3>
            <p className="text-xs text-ink-500 mt-0.5">
              Pick a source or add a new one — it saves for everyone.
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

        <div className="px-4 pb-4 space-y-2">
          {sources === null ? (
            <div className="flex items-center gap-2 text-xs text-ink-500 px-2 py-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sources.map((s) => {
                const active = s.id === currentSourceId;
                if (managing) {
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => removeSource(s.id, s.name)}
                      disabled={pending}
                      className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                      title={`Delete ${s.name}`}
                    >
                      <Trash2 className="h-3 w-3" />
                      {s.name}
                    </button>
                  );
                }
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => pick(s.id)}
                    disabled={pending}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors disabled:opacity-60",
                      active
                        ? "border-brand-500 bg-brand-500 text-white"
                        : "border-ink-200 bg-white text-ink-800 hover:bg-ink-50"
                    )}
                  >
                    {active && <Check className="h-3 w-3" />}
                    <Tag className="h-3 w-3" />
                    {s.name}
                  </button>
                );
              })}
              {currentSourceId !== null && (
                <button
                  type="button"
                  onClick={() => pick(0)}
                  disabled={pending}
                  className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>
          )}

          {adding ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveNew();
                  if (e.key === "Escape") {
                    setAdding(false);
                    setNewName("");
                  }
                }}
                maxLength={30}
                placeholder="e.g. Instagram, Referral…"
                className="flex-1 rounded-md border border-ink-200 bg-white px-2 py-1.5 text-sm text-ink-800"
                disabled={pending}
              />
              <button
                type="button"
                onClick={saveNew}
                disabled={pending || !newName.trim()}
                className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setNewName("");
                  setError(null);
                }}
                disabled={pending}
                className="grid h-8 w-8 place-items-center rounded-md border border-ink-200 bg-white text-ink-500 hover:bg-ink-50"
                aria-label="Cancel"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAdding(true)}
                disabled={pending || managing}
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-ink-300 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-50"
              >
                <Plus className="h-3 w-3" />
                Add new
              </button>
              {canManage && (sources?.length ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={() => setManaging((v) => !v)}
                  disabled={pending}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
                    managing
                      ? "border-ink-300 bg-ink-100 text-ink-700"
                      : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
                  )}
                >
                  <Trash2 className="h-3 w-3" />
                  {managing ? "Done" : "Delete"}
                </button>
              )}
            </div>
          )}

          {managing && (
            <p className="text-[11px] text-ink-500">Tap a source to delete it.</p>
          )}
          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>,
    portalNode
  );
}

/* ---------- Location row + picker (mirrors source) ---------- */

function LocationRow({
  leadId,
  location,
  canManage,
}: {
  leadId: number;
  location: { id: number; name: string } | null;
  canManage?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1.5 md:gap-2 px-2 py-1 md:px-2.5 md:py-1.5 text-left hover:bg-ink-50"
      >
        <span className="w-9 md:w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
          Loc
        </span>
        <span className="flex-1 min-w-0">
          {location ? (
            <span className="inline-flex max-w-full items-start gap-1 rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-semibold leading-tight text-brand-700 ring-1 ring-brand-200">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="break-words">{location.name}</span>
            </span>
          ) : (
            <span className="text-[11px] italic text-ink-400">Tap…</span>
          )}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-400" />
      </button>
      {open && (
        <LocationPicker
          leadId={leadId}
          currentLocationId={location?.id ?? null}
          canManage={canManage}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function LocationPicker({
  leadId,
  currentLocationId,
  canManage,
  onClose,
}: {
  leadId: number;
  currentLocationId: number | null;
  canManage?: boolean;
  onClose: () => void;
}) {
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  const [locations, setLocations] = useState<{ id: number; name: string }[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const removeLocation = (id: number, name: string) => {
    if (!confirm(`Delete location "${name}"? It will be cleared from any leads using it.`)) return;
    setError(null);
    const fd = new FormData();
    fd.set("id", String(id));
    startTransition(async () => {
      const res = await deleteLeadLocationAction(fd);
      if (res?.error) setError(res.error);
      else setLocations((prev) => (prev ?? []).filter((l) => l.id !== id));
    });
  };

  useEffect(() => {
    setPortalNode(document.body);
    listLeadLocationsAction()
      .then(setLocations)
      .catch(() => setLocations([]));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!portalNode) return null;

  const pick = (locationId: number) => {
    setError(null);
    const fd = new FormData();
    fd.set("leadId", String(leadId));
    fd.set("locationId", String(locationId));
    startTransition(async () => {
      const res = await setLeadLocationAction(fd);
      if (res?.error) setError(res.error);
      else onClose();
    });
  };

  const saveNew = () => {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    const fd = new FormData();
    fd.set("name", name);
    startTransition(async () => {
      const res = await addLeadLocationAction(fd);
      if (!res || res.error || !res.locationId) {
        setError(res?.error ?? "Could not add location.");
        return;
      }
      setLocations((prev) => [...(prev ?? []), { id: res.locationId!, name }]);
      pick(res.locationId);
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center">
      <button
        aria-label="Close location picker"
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm animate-in"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pick lead location"
        className="relative w-full md:w-[360px] bg-white shadow-lift animate-in rounded-t-2xl md:rounded-2xl pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="md:hidden flex justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-ink-200" aria-hidden />
        </div>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div>
            <h3 className="text-base font-semibold text-ink-900">Where is this lead located?</h3>
            <p className="text-xs text-ink-500 mt-0.5">
              Pick a location or add a new one — it saves for everyone.
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

        <div className="px-4 pb-4 space-y-2">
          {locations === null ? (
            <div className="flex items-center gap-2 text-xs text-ink-500 px-2 py-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {locations.map((l) => {
                const active = l.id === currentLocationId;
                if (managing) {
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => removeLocation(l.id, l.name)}
                      disabled={pending}
                      className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                      title={`Delete ${l.name}`}
                    >
                      <Trash2 className="h-3 w-3" />
                      {l.name}
                    </button>
                  );
                }
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => pick(l.id)}
                    disabled={pending}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors disabled:opacity-60",
                      active
                        ? "border-brand-500 bg-brand-500 text-white"
                        : "border-ink-200 bg-white text-ink-800 hover:bg-ink-50"
                    )}
                  >
                    {active && <Check className="h-3 w-3" />}
                    <MapPin className="h-3 w-3" />
                    {l.name}
                  </button>
                );
              })}
              {currentLocationId !== null && (
                <button
                  type="button"
                  onClick={() => pick(0)}
                  disabled={pending}
                  className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>
          )}

          {adding ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveNew();
                  if (e.key === "Escape") {
                    setAdding(false);
                    setNewName("");
                  }
                }}
                maxLength={40}
                placeholder="e.g. Ipoh, Kuantan…"
                className="flex-1 rounded-md border border-ink-200 bg-white px-2 py-1.5 text-sm text-ink-800"
                disabled={pending}
              />
              <button
                type="button"
                onClick={saveNew}
                disabled={pending || !newName.trim()}
                className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setNewName("");
                  setError(null);
                }}
                disabled={pending}
                className="grid h-8 w-8 place-items-center rounded-md border border-ink-200 bg-white text-ink-500 hover:bg-ink-50"
                aria-label="Cancel"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAdding(true)}
                disabled={pending || managing}
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-ink-300 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-50"
              >
                <Plus className="h-3 w-3" />
                Add more
              </button>
              {canManage && (locations?.length ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={() => setManaging((v) => !v)}
                  disabled={pending}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
                    managing
                      ? "border-ink-300 bg-ink-100 text-ink-700"
                      : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
                  )}
                >
                  <Trash2 className="h-3 w-3" />
                  {managing ? "Done" : "Delete"}
                </button>
              )}
            </div>
          )}

          {managing && (
            <p className="text-[11px] text-ink-500">Tap a location to delete it.</p>
          )}
          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>,
    portalNode
  );
}
