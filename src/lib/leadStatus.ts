import type { LeadStatus } from "@prisma/client";

export const STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACT_ABLE: "Contact · Able",
  CONTACT_NOT_ABLE: "Contact · Not able",
  DOCUMENTS_ABLE: "Documents · Able to get",
  DOCUMENTS_NOT_ABLE: "Documents · Not able to get",
  APPOINTMENT_ABLE: "Appointment · Able",
  APPOINTMENT_NOT_ABLE: "Appointment · Not able",
  SPAM_OR_MISSING: "Spam / Missing",
  REJECTED: "Rejected",
  APPROVED: "Approved",
};

export const STATUS_SHORT: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACT_ABLE: "Contact ✓",
  CONTACT_NOT_ABLE: "Contact ✗",
  DOCUMENTS_ABLE: "Docs ✓",
  DOCUMENTS_NOT_ABLE: "Docs ✗",
  APPOINTMENT_ABLE: "Appt ✓",
  APPOINTMENT_NOT_ABLE: "Appt ✗",
  SPAM_OR_MISSING: "Spam/Missing",
  REJECTED: "Rejected",
  APPROVED: "Approved",
};

// Only NEW leads sit in Open. The moment a lead leaves NEW (Contact / Docs /
// Appointment / Spam / Reject / Approve) it moves into Archive, where it
// becomes the assignee's "work in progress" view. Master sees everything,
// non-master sees only what they picked up.
export const OPEN_STATUSES: LeadStatus[] = ["NEW"];

export const ARCHIVED_STATUSES: LeadStatus[] = [
  "CONTACT_ABLE",
  "CONTACT_NOT_ABLE",
  "DOCUMENTS_ABLE",
  "DOCUMENTS_NOT_ABLE",
  "APPOINTMENT_ABLE",
  "APPOINTMENT_NOT_ABLE",
  "SPAM_OR_MISSING",
  "REJECTED",
  "APPROVED",
];

export function isArchived(status: LeadStatus): boolean {
  return ARCHIVED_STATUSES.includes(status);
}

/**
 * Archive sections — in display order. The dashboard groups archived leads
 * by these buckets so users can scan "what didn't work" at a glance.
 *
 * Note: APPROVED is master-only; the dashboard filters it out for regular
 * users before grouping, so it's last in this list (only seen by masters).
 */
// Archive sections in display order. APPROVED is filtered out for non-master
// viewers at render time, so it sits at the end of this list.
export const ARCHIVE_SECTIONS: { status: LeadStatus; label: string; tone: "bad" | "terminal" | "good" }[] = [
  { status: "CONTACT_ABLE", label: "Contact · Able", tone: "good" },
  { status: "CONTACT_NOT_ABLE", label: "Contact · Not Able", tone: "bad" },
  { status: "DOCUMENTS_ABLE", label: "Documents · Able to Get", tone: "good" },
  { status: "DOCUMENTS_NOT_ABLE", label: "Documents · Not Able to Get", tone: "bad" },
  { status: "APPOINTMENT_ABLE", label: "Appointment · Able", tone: "good" },
  { status: "APPOINTMENT_NOT_ABLE", label: "Appointment · Not Able", tone: "bad" },
  { status: "SPAM_OR_MISSING", label: "Spam or Missing", tone: "terminal" },
  { status: "REJECTED", label: "Rejected", tone: "terminal" },
  { status: "APPROVED", label: "Approved (master only)", tone: "good" },
];

export type StatusGroup = {
  key: string;
  title: string;
  options: { value: LeadStatus; label: string; tone: "good" | "bad" | "terminal" }[];
};

// Grouped options for the status picker — matches the spec exactly.
export const STATUS_GROUPS: StatusGroup[] = [
  {
    key: "contact",
    title: "Contact",
    options: [
      { value: "CONTACT_ABLE", label: "Able to contact", tone: "good" },
      { value: "CONTACT_NOT_ABLE", label: "Not able to contact", tone: "bad" },
    ],
  },
  {
    key: "documents",
    title: "Documents",
    options: [
      { value: "DOCUMENTS_ABLE", label: "Able to get", tone: "good" },
      { value: "DOCUMENTS_NOT_ABLE", label: "Not able to get", tone: "bad" },
    ],
  },
  {
    key: "appointment",
    title: "Appointment",
    options: [
      { value: "APPOINTMENT_ABLE", label: "Able", tone: "good" },
      { value: "APPOINTMENT_NOT_ABLE", label: "Not able", tone: "bad" },
    ],
  },
  {
    key: "terminal",
    title: "Resolve",
    options: [
      { value: "SPAM_OR_MISSING", label: "Spam or Missing", tone: "terminal" },
      { value: "REJECTED", label: "Reject", tone: "terminal" },
      { value: "APPROVED", label: "Approve", tone: "terminal" },
    ],
  },
];

// Pill colors used by StatusBadge.
export const STATUS_TONE: Record<LeadStatus, string> = {
  NEW: "bg-ink-100 text-ink-700 ring-ink-200",
  CONTACT_ABLE: "bg-sky-50 text-sky-700 ring-sky-200",
  CONTACT_NOT_ABLE: "bg-rose-50 text-rose-700 ring-rose-200",
  DOCUMENTS_ABLE: "bg-violet-50 text-violet-700 ring-violet-200",
  DOCUMENTS_NOT_ABLE: "bg-rose-50 text-rose-700 ring-rose-200",
  APPOINTMENT_ABLE: "bg-amber-50 text-amber-700 ring-amber-200",
  APPOINTMENT_NOT_ABLE: "bg-rose-50 text-rose-700 ring-rose-200",
  SPAM_OR_MISSING: "bg-ink-200 text-ink-700 ring-ink-300",
  REJECTED: "bg-rose-100 text-rose-800 ring-rose-300",
  APPROVED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};
