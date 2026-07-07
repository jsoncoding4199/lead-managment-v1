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
  RECYCLED: "Recycled to Archive",
};

// "Active work" — the three "Able" statuses. Visible only to the lead's
// assignees (or master).
export const ACTIVE_STATUSES: LeadStatus[] = [
  "CONTACT_ABLE",
  "DOCUMENTS_ABLE",
  "APPOINTMENT_ABLE",
];

// "Soft negative" outcomes — the team tried and couldn't progress the
// lead, but it's not a hard close. Still visible in the shared views so
// anyone can take another shot. These never auto-archive.
export const SOFT_NEGATIVE_STATUSES: LeadStatus[] = [
  "CONTACT_NOT_ABLE",
  "DOCUMENTS_NOT_ABLE",
  "APPOINTMENT_NOT_ABLE",
  "SPAM_OR_MISSING",
];

// Terminal statuses that always land the lead in the master-only Archive
// tab. Only APPROVED + RECYCLED qualify — everything else stays in place.
export const ALWAYS_ARCHIVED_STATUSES: LeadStatus[] = ["APPROVED", "RECYCLED"];

/**
 * How many days a lead can sit before it auto-migrates from Fresh to
 * Open Market. Two days per current product spec.
 */
export const AGE_BOUNDARY_DAYS = 2;

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
  RECYCLED: "bg-ink-200 text-ink-700 ring-ink-300",
};
