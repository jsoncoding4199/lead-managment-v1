"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import type { LeadStatus, LeadQuality } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser, requireMaster } from "@/lib/auth";
import { STATUS_LABEL } from "@/lib/leadStatus";
import { sendPushToUsers, getAllUserIds, getMasterIds } from "@/lib/webPush";
import { canAccessLead } from "@/lib/channels";
import { parseSheet, normalizeHeader, normalizePhone } from "@/lib/sheet";

/**
 * Focused push to the lead's original creator about a change to their
 * lead. Carries the actor + a one-liner describing what happened. Quiet
 * no-op when the creator IS the actor (don't notify yourself).
 *
 * Used for ALL change events — status, drop, reject, reset, pickup,
 * assignment, content edit, quality, delete, remark add/edit — so the
 * creator gets one consistent feed of "what happened to my lead".
 *
 * Uses a distinct tag (`lead-${id}-creator`) so the focused push doesn't
 * collide with the broadcast "lead-${id}" push for the same event.
 */
async function notifyLeadCreator(opts: {
  leadId: number;
  creatorId: number;
  actorId: number;
  title: string;
  body: string;
  url?: string;
  // Drives the notification-feed tabs: "assign" (into my channel),
  // "pickup" (OK/pick-up), "status" (status changes). "lead"/"approved"
  // are legacy/general and fall into the Status tab.
  kind?: "status" | "lead" | "approved" | "pickup" | "assign";
}): Promise<void> {
  if (opts.creatorId === opts.actorId) return;
  await sendPushToUsers({
    userIds: [opts.creatorId],
    payload: {
      title: opts.title,
      body: opts.body,
      url: opts.url ?? `/dashboard/leads/${opts.leadId}`,
      kind: opts.kind ?? "lead",
      tag: `lead-${opts.leadId}-creator`,
    },
  });
}

/**
 * Channel guard for every Lead-touching action. Fetches just the lead's
 * channel + status (cheap, single index lookup) and returns null when the
 * caller has no business operating on this lead — by lead missing OR by
 * channel access denied. The two are returned identically so probing IDs
 * can't confirm whether a private lead exists. Returns the lead's channel
 * + current status when access is granted so the caller can avoid a second
 * fetch.
 */
async function loadAccessibleLeadMeta(
  leadId: number,
  user: import("@/lib/auth").CurrentUser
): Promise<{
  privateChannelUserId: number | null;
  status: LeadStatus;
  createdById: number;
} | null> {
  const meta = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { privateChannelUserId: true, status: true, createdById: true },
  });
  if (!meta) return null;
  if (!canAccessLead(user, meta.privateChannelUserId)) return null;
  return meta;
}

const CreateSchema = z.object({
  content: z.string().trim().min(1, "Paste something into the lead.").max(8000),
  // Optional structured contact fields — surfaced as tap-to-copy /
  // tap-to-call / tap-to-WhatsApp rows on the lead card.
  name: z.string().trim().max(200).optional(),
  ic: z.string().trim().max(50).optional(),
  phone: z.string().trim().max(50).optional(),
  // Optional LeadSource pointer. Any positive id must exist in LeadSource.
  sourceId: z.coerce.number().int().positive().optional(),
  locationId: z.coerce.number().int().positive().optional(),
  // Optional pointer to a private channel user. Master-only; everyone
  // else's value is ignored. Empty / 0 means a public lead.
  privateChannelUserId: z.coerce.number().int().positive().optional(),
  // ponytail: initial contact-history tag stored as a LeadRemark rather
  // than a new LeadStatus enum value — "Called before" / "WhatsApp before"
  // aren't pipeline progress, they're notes for the assignee.
  initialNote: z.enum(["CALLED_BEFORE", "WHATSAPP_BEFORE"]).optional(),
  // Optional list of userIds to assign to the lead right at creation. Any
  // active user (including master) is a valid target. Caps at 8 to guard
  // against a broken client posting an unbounded list.
  assignedUserIds: z.array(z.coerce.number().int().positive()).max(8).optional(),
});

const ContactStateValues = ["NEW", "CALLED_BEFORE", "WHATSAPP_BEFORE"] as const;

const SetContactStateSchema = z.object({
  leadId: z.coerce.number().int().positive(),
  contactState: z.enum(ContactStateValues),
});

export async function setContactStateAction(
  formData: FormData
): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const parsed = SetContactStateSchema.safeParse({
    leadId: formData.get("leadId"),
    contactState: formData.get("contactState"),
  });
  if (!parsed.success) return { error: "Invalid contact state." };

  const meta = await loadAccessibleLeadMeta(parsed.data.leadId, user);
  if (!meta) return { error: "Lead not found." };

  await prisma.lead.update({
    where: { id: parsed.data.leadId },
    data: { contactState: parsed.data.contactState },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${parsed.data.leadId}`);
}

/** Return all LeadSource rows for the picker. Alphabetical. */
export async function listLeadSourcesAction(): Promise<
  { id: number; name: string }[]
> {
  await requireUser();
  return prisma.leadSource.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Add a new LeadSource (Ezy / FB / etc). Unique on name (case-insensitive
 * via a lookup pre-check). Any user can add — sources are team-wide.
 * Returns the resulting source id so the caller can assign it right away.
 */
const AddSourceSchema = z.object({
  name: z.string().trim().min(1, "Source name is required.").max(30),
});

export async function addLeadSourceAction(
  formData: FormData
): Promise<{ error?: string; sourceId?: number } | void> {
  await requireUser();
  const parsed = AddSourceSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid name." };
  }
  const name = parsed.data.name;
  const existing = await prisma.leadSource.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) {
    revalidatePath("/dashboard");
    return { sourceId: existing.id };
  }
  const created = await prisma.leadSource.create({
    data: { name },
    select: { id: true },
  });
  revalidatePath("/dashboard");
  return { sourceId: created.id };
}

/**
 * Set (or clear) the source on an existing lead. `sourceId=0` clears it.
 */
const SetSourceSchema = z.object({
  leadId: z.coerce.number().int().positive(),
  sourceId: z.coerce.number().int().min(0),
});

export async function setLeadSourceAction(
  formData: FormData
): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const parsed = SetSourceSchema.safeParse({
    leadId: formData.get("leadId"),
    sourceId: formData.get("sourceId"),
  });
  if (!parsed.success) return { error: "Invalid source." };

  const meta = await loadAccessibleLeadMeta(parsed.data.leadId, user);
  if (!meta) return { error: "Lead not found." };

  if (parsed.data.sourceId > 0) {
    const exists = await prisma.leadSource.findUnique({
      where: { id: parsed.data.sourceId },
      select: { id: true },
    });
    if (!exists) return { error: "Unknown source." };
  }

  await prisma.lead.update({
    where: { id: parsed.data.leadId },
    data: { sourceId: parsed.data.sourceId || null },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${parsed.data.leadId}`);
}

/**
 * Delete a source from the team-wide registry. Master-only — it's a shared
 * option, so one user shouldn't be able to remove "Ezy" for everyone. Any
 * leads currently tagged with it have their source cleared (set null)
 * first, so the delete never fails on the foreign key.
 */
const DeleteNamedSchema = z.object({ id: z.coerce.number().int().positive() });

export async function deleteLeadSourceAction(
  formData: FormData
): Promise<{ error?: string; ok?: boolean }> {
  await requireMaster();
  const parsed = DeleteNamedSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid source." };
  await prisma.$transaction([
    prisma.lead.updateMany({ where: { sourceId: parsed.data.id }, data: { sourceId: null } }),
    prisma.leadSource.delete({ where: { id: parsed.data.id } }),
  ]);
  revalidatePath("/dashboard");
  return { ok: true };
}

/* ---------- Lead location (mirrors source) ---------- */

/** Return all LeadLocation rows for the picker. Alphabetical. */
export async function listLeadLocationsAction(): Promise<
  { id: number; name: string }[]
> {
  await requireUser();
  return prisma.leadLocation.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

const AddLocationSchema = z.object({
  name: z.string().trim().min(1, "Location name is required.").max(40),
});

export async function addLeadLocationAction(
  formData: FormData
): Promise<{ error?: string; locationId?: number } | void> {
  await requireUser();
  const parsed = AddLocationSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid name." };
  }
  const name = parsed.data.name;
  const existing = await prisma.leadLocation.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) {
    revalidatePath("/dashboard");
    return { locationId: existing.id };
  }
  const created = await prisma.leadLocation.create({
    data: { name },
    select: { id: true },
  });
  revalidatePath("/dashboard");
  return { locationId: created.id };
}

const SetLocationSchema = z.object({
  leadId: z.coerce.number().int().positive(),
  locationId: z.coerce.number().int().min(0),
});

export async function setLeadLocationAction(
  formData: FormData
): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const parsed = SetLocationSchema.safeParse({
    leadId: formData.get("leadId"),
    locationId: formData.get("locationId"),
  });
  if (!parsed.success) return { error: "Invalid location." };

  const meta = await loadAccessibleLeadMeta(parsed.data.leadId, user);
  if (!meta) return { error: "Lead not found." };

  if (parsed.data.locationId > 0) {
    const exists = await prisma.leadLocation.findUnique({
      where: { id: parsed.data.locationId },
      select: { id: true },
    });
    if (!exists) return { error: "Unknown location." };
  }

  await prisma.lead.update({
    where: { id: parsed.data.leadId },
    data: { locationId: parsed.data.locationId || null },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${parsed.data.leadId}`);
}

/** Delete a location from the team-wide registry (master-only, mirrors
 *  deleteLeadSourceAction — clears it off any leads first). */
export async function deleteLeadLocationAction(
  formData: FormData
): Promise<{ error?: string; ok?: boolean }> {
  await requireMaster();
  const parsed = DeleteNamedSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid location." };
  await prisma.$transaction([
    prisma.lead.updateMany({ where: { locationId: parsed.data.id }, data: { locationId: null } }),
    prisma.leadLocation.delete({ where: { id: parsed.data.id } }),
  ]);
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Inline edit of the structured name field on an existing lead. Any user
 * with access can fix a mis-parsed name from the card. Empty string clears.
 */
const SetNameSchema = z.object({
  leadId: z.coerce.number().int().positive(),
  name: z.string().trim().max(200),
});

export async function setLeadNameAction(
  formData: FormData
): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const parsed = SetNameSchema.safeParse({
    leadId: formData.get("leadId"),
    name: formData.get("name") ?? "",
  });
  if (!parsed.success) return { error: "Invalid name." };

  const meta = await loadAccessibleLeadMeta(parsed.data.leadId, user);
  if (!meta) return { error: "Lead not found." };

  await prisma.lead.update({
    where: { id: parsed.data.leadId },
    data: { name: parsed.data.name || null },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${parsed.data.leadId}`);
}

/**
 * Inline edit of the structured phone field on an existing lead. Any user
 * with access to the lead can fix a wrong number without opening the
 * detail page. Empty string clears the field (falls back to phone extracted
 * from the free-text content).
 */
const SetPhoneSchema = z.object({
  leadId: z.coerce.number().int().positive(),
  phone: z.string().trim().max(50),
});

export async function setLeadPhoneAction(
  formData: FormData
): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const parsed = SetPhoneSchema.safeParse({
    leadId: formData.get("leadId"),
    phone: formData.get("phone") ?? "",
  });
  if (!parsed.success) return { error: "Invalid phone." };

  const meta = await loadAccessibleLeadMeta(parsed.data.leadId, user);
  if (!meta) return { error: "Lead not found." };

  await prisma.lead.update({
    where: { id: parsed.data.leadId },
    data: { phone: parsed.data.phone || null },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${parsed.data.leadId}`);
}

export async function createLeadAction(formData: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const rawPrivate = formData.get("privateChannelUserId");
  const parsed = CreateSchema.safeParse({
    content: formData.get("content"),
    name: formData.get("name") || undefined,
    ic: formData.get("ic") || undefined,
    phone: formData.get("phone") || undefined,
    sourceId: formData.get("sourceId") || undefined,
    locationId: formData.get("locationId") || undefined,
    privateChannelUserId: rawPrivate || undefined,
    initialNote: formData.get("initialNote") || undefined,
    assignedUserIds: formData.getAll("assignedUserIds").filter(Boolean),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  // "Own" list flag — master-only. Own leads live under the master's own
  // private channel (privateChannelUserId = master.id) plus this marker,
  // and get an automatic 1-hour follow-up reminder.
  const isOwn = formData.get("isOwn") === "true" && user.role === "MASTER";

  let privateChannelUserId: number | null = parsed.data.privateChannelUserId ?? null;
  if (isOwn) privateChannelUserId = user.id;
  // Master can target any channel; everyone else may only create into
  // their OWN private pipeline (the composer on their private tab).
  if (
    privateChannelUserId !== null &&
    user.role !== "MASTER" &&
    privateChannelUserId !== user.id
  ) {
    return { error: "You can only add leads to your own pipeline." };
  }
  if (privateChannelUserId !== null && privateChannelUserId !== user.id) {
    // Master can drop a lead into their own inbox unconditionally. For any
    // other target, just require an active user — trust master's routing
    // rather than gating on isPrivateChannel (which may be off for AH-style
    // pipelines managed manually).
    const target = await prisma.user.findUnique({
      where: { id: privateChannelUserId },
      select: { id: true, active: true },
    });
    if (!target || !target.active) {
      return { error: "Pick a valid user." };
    }
  }

  // Dedupe + validate assignee list. Ignore silently rather than 400 —
  // the composer picker only shows active users, so anything bogus is a
  // stale client cache.
  const requestedAssignees = Array.from(new Set(parsed.data.assignedUserIds ?? []));
  const validAssignees =
    requestedAssignees.length === 0
      ? []
      : (
          await prisma.user.findMany({
            where: { id: { in: requestedAssignees }, active: true },
            select: { id: true },
          })
        ).map((u) => u.id);

  const lead = await prisma.$transaction(async (tx) => {
    // If sourceId was posted, verify it exists (defends against a stale
     // picker client posting a deleted id — unlikely but cheap).
    let sourceId: number | null = null;
    if (parsed.data.sourceId) {
      const s = await tx.leadSource.findUnique({
        where: { id: parsed.data.sourceId },
        select: { id: true },
      });
      if (s) sourceId = s.id;
    }
    let locationId: number | null = null;
    if (parsed.data.locationId) {
      const loc = await tx.leadLocation.findUnique({
        where: { id: parsed.data.locationId },
        select: { id: true },
      });
      if (loc) locationId = loc.id;
    }
    const created = await tx.lead.create({
      data: {
        content: parsed.data.content,
        name: parsed.data.name || null,
        ic: parsed.data.ic || null,
        phone: parsed.data.phone || null,
        sourceId,
        locationId,
        status: "NEW",
        contactState: parsed.data.initialNote ?? "NEW",
        privateChannelUserId,
        isOwn,
        createdById: user.id,
      },
    });
    // Own-list leads auto-get a 1-hour follow-up reminder for the master.
    if (isOwn) {
      await tx.leadReminder.create({
        data: {
          leadId: created.id,
          userId: user.id,
          remindAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
    } else if (privateChannelUserId !== null && privateChannelUserId !== user.id) {
      // Lead pumped into someone else's private channel: nudge that user
      // after 15 minutes if they haven't acted. Cancelled when they tap
      // OK/Pick (okPickLeadAction clears their reminder).
      await tx.leadReminder.create({
        data: {
          leadId: created.id,
          userId: privateChannelUserId,
          remindAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      });
    }
    if (validAssignees.length > 0) {
      await tx.leadAssignment.createMany({
        data: validAssignees.map((uid) => ({
          leadId: created.id,
          userId: uid,
          assignedById: user.id,
        })),
        skipDuplicates: true,
      });
    }
    return created;
  });

  revalidatePath("/dashboard");

  // Build a multi-line body so Android's notification banner shows the
  // one-line summary collapsed AND expands into the full detail block
  // when the user drags the notification down.
  const detailLines: string[] = [];
  if (parsed.data.name) detailLines.push(`👤 ${parsed.data.name}`);
  if (parsed.data.phone) detailLines.push(`📞 ${parsed.data.phone}`);
  const contentSnippet = parsed.data.content
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  if (contentSnippet && detailLines.length === 0) {
    // Only fall back to the raw content blob when there are no structured
    // fields — otherwise the snippet would duplicate the same info.
    detailLines.push(contentSnippet);
  }
  const detailBlock = detailLines.length > 0 ? `\n\n${detailLines.join("\n")}` : "";

  after(async () => {
    if (privateChannelUserId !== null) {
      await sendPushToUsers({
        userIds: [privateChannelUserId],
        excludeUserId: user.id,
        payload: {
          title: "New private-channel lead",
          body: `Master added lead #${lead.id} to your private pipeline${detailBlock}`,
          url: `/dashboard/leads/${lead.id}`,
          kind: "assign",
          tag: `lead-${lead.id}`,
        },
      });
    } else {
      await sendPushToUsers({
        userIds: await getAllUserIds(),
        excludeUserId: user.id,
        payload: {
          title: "New lead",
          body: `${user.displayName} added lead #${lead.id} in Fresh${detailBlock}`,
          url: `/dashboard/leads/${lead.id}`,
          kind: "lead",
          tag: `lead-${lead.id}`,
        },
      });
    }
    // Focused push to each assignee: "you were assigned lead #N".
    if (validAssignees.length > 0) {
      await sendPushToUsers({
        userIds: validAssignees,
        excludeUserId: user.id,
        payload: {
          title: "Lead assigned to you",
          body: `${user.displayName} assigned you lead #${lead.id}${detailBlock}`,
          url: `/dashboard/leads/${lead.id}`,
          kind: "assign",
          tag: `lead-${lead.id}-assign`,
        },
      });
    }
  });
}

const StatusValues = [
  "NEW",
  "CONTACT_ABLE",
  "CONTACT_NOT_ABLE",
  "DOCUMENTS_ABLE",
  "DOCUMENTS_NOT_ABLE",
  "APPOINTMENT_ABLE",
  "APPOINTMENT_NOT_ABLE",
  "SPAM_OR_MISSING",
  "REJECTED",
  "APPROVED",
  "RECYCLED",
] as const;

const ChangeStatusSchema = z.object({
  leadId: z.coerce.number().int().positive(),
  status: z.enum(StatusValues),
  note: z.string().trim().max(500).optional(),
});

export async function changeStatusAction(formData: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const parsed = ChangeStatusSchema.safeParse({
    leadId: formData.get("leadId"),
    status: formData.get("status"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: "Invalid status change." };

  const lead = await prisma.lead.findUnique({ where: { id: parsed.data.leadId } });
  if (!lead) return { error: "Lead not found." };
  if (!canAccessLead(user, lead.privateChannelUserId)) return { error: "Lead not found." };

  if (lead.status === parsed.data.status) {
    return; // no-op
  }

  // Reject must always carry a written reason. Enforced both client- and
  // server-side so a malicious client can't bypass the prompt.
  if (parsed.data.status === "REJECTED" && !parsed.data.note?.trim()) {
    return { error: "A rejection reason is required." };
  }
  // Recycling also requires a remark — it's saved to the lead's remark thread
  // so anyone opening the details can see why it was binned.
  if (parsed.data.status === "RECYCLED" && !parsed.data.note?.trim()) {
    return { error: "A remark is required to recycle a lead." };
  }

  // Status changes NEVER move a lead between pipelines. A private lead
  // stays in its private pipeline through every status — EXCEPT RECYCLED,
  // which is the explicit "send to Archive" action and clears the private
  // channel + assignments so it surfaces in the shared Archive tab.
  const newStatus = parsed.data.status as LeadStatus;
  const isRecycle = newStatus === "RECYCLED";
  const leadUpdate: {
    status: LeadStatus;
    privateChannelUserId?: number | null;
  } = isRecycle
    ? { status: newStatus, privateChannelUserId: null }
    : { status: newStatus };

  await prisma.$transaction([
    prisma.lead.update({
      where: { id: lead.id },
      data: leadUpdate,
    }),
    ...(isRecycle
      ? [
          prisma.leadAssignment.deleteMany({ where: { leadId: lead.id } }),
          // Surface the recycle reason in the remark thread (details > remark).
          prisma.leadRemark.create({
            data: {
              leadId: lead.id,
              authorId: user.id,
              body: `Recycled: ${parsed.data.note!.trim()}`,
            },
          }),
        ]
      : []),
    prisma.leadStatusChange.create({
      data: {
        leadId: lead.id,
        fromStatus: lead.status,
        toStatus: newStatus,
        note: parsed.data.note,
        changedById: user.id,
      },
    }),
  ]);

  // 'layout' so the sidebar's per-status count badges (computed in the
  // dashboard layout) refresh too, not just the lead list on the page.
  revalidatePath("/dashboard", "layout");
  revalidatePath(`/dashboard/leads/${lead.id}`);

  // Push runs after the response is sent.
  //   1. Focused push to the lead's creator (regardless of which status)
  //      so they always learn about state changes to their own lead.
  //   2. Broadcast push to the rest of the team — masters only when the
  //      status is APPROVED, everyone otherwise. Creator is excluded
  //      from the broadcast so they only get the focused notification.
  const toStatus = parsed.data.status as LeadStatus;
  after(async () => {
    const reason = parsed.data.note?.trim() || STATUS_LABEL[toStatus];

    // "Own" leads are the master's private list. Status changes notify the
    // master directly (they manage the list) and NEVER broadcast to the
    // team. Handled here and returned so the standard creator-notify +
    // team-broadcast paths below stay untouched for every other lead.
    if (lead.isOwn && lead.privateChannelUserId !== null) {
      await sendPushToUsers({
        userIds: [lead.privateChannelUserId],
        payload: {
          title: "Own lead status changed",
          body: `#${lead.id} → ${STATUS_LABEL[toStatus]}`,
          url: `/dashboard/leads/${lead.id}`,
          kind: "status",
          tag: `lead-${lead.id}-own`,
        },
      });
      return;
    }

    const focusedTitle =
      toStatus === "APPROVED" ? "Your lead was approved 🎉" :
      toStatus === "REJECTED" ? "Your lead was rejected" :
      "Your lead status changed";
    await notifyLeadCreator({
      leadId: lead.id,
      creatorId: lead.createdById,
      actorId: user.id,
      title: focusedTitle,
      body: `${user.displayName} · #${lead.id}: ${reason}`,
      kind: toStatus === "APPROVED" ? "approved" : "status",
    });

    if (toStatus === "APPROVED") {
      const masterIds = await getMasterIds();
      await sendPushToUsers({
        userIds: masterIds.filter((id) => id !== lead.createdById),
        excludeUserId: user.id,
        payload: {
          title: "Lead approved 🎉",
          body: `${user.displayName} approved lead #${lead.id}`,
          url: `/dashboard/leads/${lead.id}`,
          kind: "approved",
          tag: `lead-${lead.id}`,
        },
      });
    } else {
      const allUsers = await getAllUserIds();
      await sendPushToUsers({
        userIds: allUsers.filter((id) => id !== lead.createdById),
        excludeUserId: user.id,
        payload: {
          title: "Lead status changed",
          body: `${user.displayName} moved #${lead.id} → ${STATUS_LABEL[toStatus]}`,
          url: `/dashboard/leads/${lead.id}`,
          kind: "status",
          tag: `lead-${lead.id}`,
        },
      });
    }
  });
}

/**
 * MASTER ONLY — replace the lead's full assignee set with `userIds`.
 * Empty array means "unassigned". Bypasses the maxPickup cap (master override).
 */
const SetAssignmentsSchema = z.object({
  leadId: z.coerce.number().int().positive(),
  userIds: z.array(z.coerce.number().int().positive()),
});

export async function setLeadAssignmentsAction(input: {
  leadId: number;
  userIds: number[];
}): Promise<{ error?: string } | void> {
  const master = await requireMaster();
  const parsed = SetAssignmentsSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid assignment." };

  // Master can see all channels, but call the helper anyway so the rule
  // lives in one place; also guarantees the lead exists.
  const meta = await loadAccessibleLeadMeta(parsed.data.leadId, master);
  if (!meta) return { error: "Lead not found." };

  // Validate every userId is an active USER (not master, not disabled).
  const valid = await prisma.user.count({
    where: { id: { in: parsed.data.userIds }, active: true, role: "USER" },
  });
  if (valid !== parsed.data.userIds.length) {
    return { error: "One or more users are invalid or inactive." };
  }

  await prisma.$transaction([
    prisma.leadAssignment.deleteMany({ where: { leadId: parsed.data.leadId } }),
    ...(parsed.data.userIds.length === 0
      ? []
      : [
          prisma.leadAssignment.createMany({
            data: parsed.data.userIds.map((userId) => ({
              leadId: parsed.data.leadId,
              userId,
              assignedById: master.id,
            })),
            skipDuplicates: true,
          }),
        ]),
  ]);

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${parsed.data.leadId}`);

  // Notify the creator that assignments on their lead changed. Look up
  // the new assignees' display names for the body so the creator sees
  // who's working it now.
  after(async () => {
    if (meta.createdById === master.id) return;
    let body = `${master.displayName} unassigned everyone from #${parsed.data.leadId}`;
    if (parsed.data.userIds.length > 0) {
      const assignees = await prisma.user.findMany({
        where: { id: { in: parsed.data.userIds } },
        select: { displayName: true },
      });
      const names = assignees.map((u) => u.displayName).join(", ");
      body = `${master.displayName} assigned #${parsed.data.leadId} to ${names}`;
    }
    await notifyLeadCreator({
      leadId: parsed.data.leadId,
      creatorId: meta.createdById,
      actorId: master.id,
      title: "Your lead was reassigned",
      body,
    });
  });
}

/**
 * Self-assign (pick up) a lead. Any signed-in user can call this for themselves.
 * Enforces AppSettings.maxPickup — won't add the user if the lead is already
 * at capacity.
 */
const PickUpSchema = z.object({ leadId: z.coerce.number().int().positive() });

export async function pickUpLeadAction(formData: FormData): Promise<{ error?: string } | void> {
  const me = await requireUser();
  const parsed = PickUpSchema.safeParse({ leadId: formData.get("leadId") });
  if (!parsed.success) return { error: "Invalid lead." };

  const [lead, settings, existing] = await Promise.all([
    prisma.lead.findUnique({ where: { id: parsed.data.leadId } }),
    prisma.appSettings.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, maxPickup: 2 },
    }),
    prisma.leadAssignment.findUnique({
      where: { leadId_userId: { leadId: parsed.data.leadId, userId: me.id } },
    }),
  ]);

  if (!lead) return { error: "Lead not found." };
  if (!canAccessLead(me, lead.privateChannelUserId)) return { error: "Lead not found." };
  if (lead.status === "APPROVED" && me.role !== "MASTER") {
    return { error: "This lead is already closed." };
  }
  if (existing) return; // already picked up — no-op

  const count = await prisma.leadAssignment.count({ where: { leadId: lead.id } });
  if (count >= settings.maxPickup) {
    return { error: `This lead is already at capacity (${settings.maxPickup}).` };
  }

  // Wrap the assignment + counters in a single transaction. Both the
  // user's and the lead's pickUpsCount stay consistent with the actual
  // assignment table; neither one decrements when the user later drops.
  await prisma.$transaction([
    prisma.leadAssignment.create({
      data: {
        leadId: lead.id,
        userId: me.id,
        assignedById: me.id, // self-assigned
      },
    }),
    prisma.user.update({
      where: { id: me.id },
      data: { pickUpsCount: { increment: 1 } },
    }),
    prisma.lead.update({
      where: { id: lead.id },
      data: { pickUpsCount: { increment: 1 } },
    }),
  ]);

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${lead.id}`);

  after(async () => {
    await notifyLeadCreator({
      leadId: lead.id,
      creatorId: lead.createdById,
      actorId: me.id,
      title: "Your lead was picked up",
      body: `${me.displayName} picked up #${lead.id}`,
      kind: "pickup",
    });
  });
}

/**
 * The non-master "OK / Pick" button in one shot: pick the lead up (if not
 * already assigned and there's capacity) AND mark it seen, then fire a
 * SINGLE notification instead of one for the pickup and one for the ack.
 * Recipients are the lead's creator + the masters, deduped. The message
 * reads "seen and picked up" when a pickup happened this tap, or just
 * "seen" when the user already held the lead.
 */
export async function okPickLeadAction(formData: FormData): Promise<{ error?: string } | void> {
  const me = await requireUser();
  const parsed = PickUpSchema.safeParse({ leadId: formData.get("leadId") });
  if (!parsed.success) return { error: "Invalid lead." };

  const [lead, settings, existing] = await Promise.all([
    prisma.lead.findUnique({ where: { id: parsed.data.leadId } }),
    prisma.appSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1, maxPickup: 2 } }),
    prisma.leadAssignment.findUnique({
      where: { leadId_userId: { leadId: parsed.data.leadId, userId: me.id } },
    }),
  ]);
  if (!lead) return { error: "Lead not found." };
  if (!canAccessLead(me, lead.privateChannelUserId)) return { error: "Lead not found." };
  if (lead.status === "APPROVED" && me.role !== "MASTER") {
    return { error: "This lead is already closed." };
  }

  let didPickUp = false;
  if (!existing) {
    const count = await prisma.leadAssignment.count({ where: { leadId: lead.id } });
    if (count >= settings.maxPickup) {
      return { error: `This lead is already at capacity (${settings.maxPickup}).` };
    }
    await prisma.$transaction([
      prisma.leadAssignment.create({
        data: { leadId: lead.id, userId: me.id, assignedById: me.id },
      }),
      prisma.user.update({ where: { id: me.id }, data: { pickUpsCount: { increment: 1 } } }),
      prisma.lead.update({ where: { id: lead.id }, data: { pickUpsCount: { increment: 1 } } }),
    ]);
    didPickUp = true;
  }

  await prisma.lead.update({
    where: { id: lead.id },
    data: { ackedAt: new Date(), ackedById: me.id },
  });

  // Tapping OK/Pick disables this user's alarm for the lead — including the
  // 15-minute default set when a lead is pumped into their private channel.
  await prisma.leadReminder.deleteMany({ where: { leadId: lead.id, userId: me.id } });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${lead.id}`);

  after(async () => {
    const recipients = new Set<number>([lead.createdById]);
    for (const mid of await getMasterIds()) recipients.add(mid);
    recipients.delete(me.id);
    if (recipients.size === 0) return;
    const what = didPickUp ? "seen and picked up" : "seen";
    await sendPushToUsers({
      userIds: Array.from(recipients),
      payload: {
        title: didPickUp ? "Lead seen and picked up" : "Lead seen",
        body: `${me.displayName} ${what} #${lead.id}`,
        url: `/dashboard/leads/${lead.id}`,
        kind: "pickup",
        tag: `lead-${lead.id}-okpick`,
      },
    });
  });
}

/** Master-only — update the global max-pickup setting. */
const MaxPickupSchema = z.object({
  maxPickup: z.coerce.number().int().min(1).max(10),
});

export async function updateMaxPickupAction(
  _prev: { error?: string; ok?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; ok?: boolean }> {
  await requireMaster();
  const parsed = MaxPickupSchema.safeParse({ maxPickup: formData.get("maxPickup") });
  if (!parsed.success) return { error: "Pick a number between 1 and 10." };

  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: { maxPickup: parsed.data.maxPickup },
    create: { id: 1, maxPickup: parsed.data.maxPickup },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/admin");
  return { ok: true };
}

/**
 * Append a new message to the lead's remark thread. Any user with channel
 * access can post — each message belongs to its author.
 */
const AddRemarkSchema = z.object({
  leadId: z.coerce.number().int().positive(),
  body: z.string().trim().min(1, "Type something first.").max(2000),
});

export async function addLeadRemarkAction(formData: FormData): Promise<{ error?: string } | void> {
  const me = await requireUser();
  const parsed = AddRemarkSchema.safeParse({
    leadId: formData.get("leadId"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid remark." };

  const meta = await loadAccessibleLeadMeta(parsed.data.leadId, me);
  if (!meta) return { error: "Lead not found." };

  await prisma.leadRemark.create({
    data: {
      leadId: parsed.data.leadId,
      authorId: me.id,
      body: parsed.data.body,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${parsed.data.leadId}`);

  after(async () => {
    // Truncate long messages so the push body stays readable.
    const snippet =
      parsed.data.body.length > 120
        ? parsed.data.body.slice(0, 117) + "…"
        : parsed.data.body;
    await notifyLeadCreator({
      leadId: parsed.data.leadId,
      creatorId: meta.createdById,
      actorId: me.id,
      title: "New remark on your lead",
      body: `${me.displayName}: ${snippet}`,
    });
  });
}

/* ------------------------- CSV / XLSX import -------------------------- */

/** Header aliases → the structured Lead columns. Everything else in the
 *  file is kept as a "Header: value" line in the lead's detail body. */
const IMPORT_FIELDS: Record<string, "name" | "phone" | "location" | "source"> = {
  name: "name",
  fullname: "name",
  applicantname: "name",
  leadname: "name",
  phone: "phone",
  phonenumber: "phone",
  phoneno: "phone",
  mobile: "phone",
  contactnumber: "phone",
  telno: "phone",
  location: "location",
  state: "location",
  source: "source",
  leadsource: "source",
};

/** Lead exports say "Kuala Lumpur" / "Putrajaya"; the registry says
 *  "KL/Selangor". Fold the Klang Valley into the existing option instead
 *  of growing three near-duplicate entries. */
const LOCATION_ALIASES: Record<string, string> = {
  kualalumpur: "KL/Selangor",
  kl: "KL/Selangor",
  selangor: "KL/Selangor",
  putrajaya: "KL/Selangor",
  klselangor: "KL/Selangor",
};

/** Find a source/location by name (case-insensitive), creating it if new. */
async function findOrCreateNamed(
  kind: "source" | "location",
  name: string,
  cache: Map<string, number>
): Promise<number> {
  const key = name.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;
  const where = { name: { equals: name, mode: "insensitive" as const } };
  const row =
    kind === "source"
      ? (await prisma.leadSource.findFirst({ where, select: { id: true } })) ??
        (await prisma.leadSource.create({ data: { name }, select: { id: true } }))
      : (await prisma.leadLocation.findFirst({ where, select: { id: true } })) ??
        (await prisma.leadLocation.create({ data: { name }, select: { id: true } }));
  cache.set(key, row.id);
  return row.id;
}

export type ImportResult = {
  error?: string;
  imported?: number;
  skippedDuplicates?: string[];
  skippedInvalid?: number;
  unmatchedHeaders?: string[];
};

/**
 * Bulk-import leads from an Excel CSV or .xlsx into the master's Own list.
 *
 * Deliberately unlike createLeadAction: no per-lead reminder (an 80-row
 * file would fire 80 pushes), no team broadcast, no assignments — these
 * are the master's own follow-up list. Rows whose phone already exists
 * anywhere in the app, or repeats earlier in the same file, are skipped
 * and reported.
 */
export async function importOwnLeadsAction(formData: FormData): Promise<ImportResult> {
  const user = await requireMaster();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Pick a file first." };
  if (file.size > 8_000_000) return { error: "File is too large (max 8 MB)." };

  let sheet;
  try {
    sheet = parseSheet(file.name, Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not read that file." };
  }
  if (sheet.headers.length === 0 || sheet.rows.length === 0) {
    return { error: "No rows found. The first row must be the column headers." };
  }

  // Map each column once: either a structured field or a detail-body line.
  const fieldOf = sheet.headers.map((h) => IMPORT_FIELDS[normalizeHeader(h)]);
  if (!fieldOf.includes("name") && !fieldOf.includes("phone")) {
    return {
      error:
        "Need a Name or Phone column. Found: " + sheet.headers.join(", "),
    };
  }
  const defaultSourceName = (formData.get("sourceName") ?? "").toString().trim();

  // Cross-reference against EVERY lead in the system — Own, Fresh, Open
  // Market, every private channel, archive — not just the Own list. A
  // number the team already holds anywhere is a duplicate, wherever it
  // sits. Seeded before the loop so a file can't insert a row twice
  // against itself either.
  const existing = await prisma.lead.findMany({
    where: { phone: { not: null } },
    select: { phone: true },
  });
  const seen = new Set(existing.map((l) => normalizePhone(l.phone ?? "")).filter(Boolean));

  const sourceCache = new Map<string, number>();
  const locationCache = new Map<string, number>();
  const defaultSourceId = defaultSourceName
    ? await findOrCreateNamed("source", defaultSourceName, sourceCache)
    : null;

  const toCreate: {
    content: string;
    name: string | null;
    phone: string | null;
    sourceId: number | null;
    locationId: number | null;
    status: "NEW";
    privateChannelUserId: number;
    isOwn: true;
    createdById: number;
  }[] = [];
  const skippedDuplicates: string[] = [];
  let skippedInvalid = 0;

  for (const row of sheet.rows) {
    let name = "";
    let phone = "";
    let locationName = "";
    let sourceName = "";
    const lines: string[] = [];

    sheet.headers.forEach((header, i) => {
      const value = (row[i] ?? "").trim();
      if (!value) return;
      switch (fieldOf[i]) {
        case "name":
          name = value;
          break;
        case "phone":
          phone = normalizePhone(value);
          break;
        case "location":
          locationName = value;
          break;
        case "source":
          sourceName = value;
          break;
      }
      // Every column — mapped or not — is kept verbatim in the body so
      // nothing from the spreadsheet is lost.
      lines.push(`${header}: ${value}`);
    });

    if (!name && !phone) {
      skippedInvalid++;
      continue;
    }
    if (phone && seen.has(phone)) {
      skippedDuplicates.push(`${name || "(no name)"} — ${phone}`);
      continue;
    }
    if (phone) seen.add(phone);

    const resolvedLocation =
      LOCATION_ALIASES[normalizeHeader(locationName)] ?? locationName;

    toCreate.push({
      content: lines.join("\n"),
      name: name.slice(0, 200) || null,
      phone: phone.slice(0, 50) || null,
      sourceId: sourceName
        ? await findOrCreateNamed("source", sourceName, sourceCache)
        : defaultSourceId,
      locationId: resolvedLocation
        ? await findOrCreateNamed("location", resolvedLocation, locationCache)
        : null,
      status: "NEW",
      privateChannelUserId: user.id,
      isOwn: true,
      createdById: user.id,
    });
  }

  if (toCreate.length > 0) {
    await prisma.lead.createMany({ data: toCreate });
  }
  revalidatePath("/dashboard");

  return {
    imported: toCreate.length,
    skippedDuplicates,
    skippedInvalid,
    unmatchedHeaders: sheet.headers.filter((_, i) => !fieldOf[i]),
  };
}

/**
 * Read a lead's remark thread. Used by the floating details window on the
 * lead card, which loads remarks on open rather than shipping them with
 * every card in the list.
 */
export async function listLeadRemarksAction(leadId: number): Promise<
  {
    id: number;
    body: string;
    createdAt: string;
    updatedAt: string;
    author: { id: number; displayName: string };
  }[]
> {
  const me = await requireUser();
  const meta = await loadAccessibleLeadMeta(leadId, me);
  if (!meta) return [];

  const rows = await prisma.leadRemark.findMany({
    where: { leadId },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, displayName: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    author: r.author,
  }));
}

/**
 * Edit a remark message. Only the author can edit their own row — the
 * updateMany WHERE clause enforces this without a separate fetch+check,
 * so a forged remarkId from someone else's row simply matches zero rows.
 */
const EditRemarkSchema = z.object({
  remarkId: z.coerce.number().int().positive(),
  body: z.string().trim().min(1, "Message can't be empty.").max(2000),
});

export async function editLeadRemarkAction(formData: FormData): Promise<{ error?: string } | void> {
  const me = await requireUser();
  const parsed = EditRemarkSchema.safeParse({
    remarkId: formData.get("remarkId"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid edit." };

  // Channel guard: load the parent lead to verify access before any write.
  const remark = await prisma.leadRemark.findUnique({
    where: { id: parsed.data.remarkId },
    select: { leadId: true, authorId: true },
  });
  if (!remark) return { error: "Message not found." };
  if (remark.authorId !== me.id) return { error: "You can only edit your own messages." };

  const meta = await loadAccessibleLeadMeta(remark.leadId, me);
  if (!meta) return { error: "Message not found." };

  await prisma.leadRemark.update({
    where: { id: parsed.data.remarkId },
    data: { body: parsed.data.body },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${remark.leadId}`);

  after(async () => {
    const snippet =
      parsed.data.body.length > 120
        ? parsed.data.body.slice(0, 117) + "…"
        : parsed.data.body;
    await notifyLeadCreator({
      leadId: remark.leadId,
      creatorId: meta.createdById,
      actorId: me.id,
      title: "Remark edited on your lead",
      body: `${me.displayName} (edited): ${snippet}`,
    });
  });
}

const EditContentSchema = z.object({
  leadId: z.coerce.number().int().positive(),
  content: z.string().trim().min(1, "Lead content can't be empty.").max(8000),
});

export async function editLeadContentAction(formData: FormData): Promise<{ error?: string } | void> {
  const me = await requireUser();
  const parsed = EditContentSchema.safeParse({
    leadId: formData.get("leadId"),
    content: formData.get("content"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid content." };

  const meta = await loadAccessibleLeadMeta(parsed.data.leadId, me);
  if (!meta) return { error: "Lead not found." };

  await prisma.lead.update({
    where: { id: parsed.data.leadId },
    data: { content: parsed.data.content },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${parsed.data.leadId}`);

  after(async () => {
    await notifyLeadCreator({
      leadId: parsed.data.leadId,
      creatorId: meta.createdById,
      actorId: me.id,
      title: "Your lead was edited",
      body: `${me.displayName} updated #${parsed.data.leadId}`,
    });
  });
}

/**
 * Reset a lead to status=NEW and backdate createdAt past the Fresh / Open
 * Market boundary so the lead immediately lands in Open Market.
 *
 *   - When the MASTER resets: also clears the entire assignment list so the
 *     lead becomes pickup-able again. Other users can now grab it. This is
 *     the only way to "unfill" a max-picked lead.
 *   - When a non-master resets: keeps existing assignments untouched.
 *     Use the "Drop" button to remove yourself first if you want out.
 *
 * Logs a NEW status change in history (note: "Reset to Open Market") so the
 * audit trail is preserved.
 */
const ResetSchema = z.object({
  leadId: z.coerce.number().int().positive(),
});

export async function resetToOpenMarketAction(formData: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const parsed = ResetSchema.safeParse({ leadId: formData.get("leadId") });
  if (!parsed.success) return { error: "Invalid lead." };

  const lead = await prisma.lead.findUnique({ where: { id: parsed.data.leadId } });
  if (!lead) return { error: "Lead not found." };
  if (!canAccessLead(user, lead.privateChannelUserId)) return { error: "Lead not found." };

  // Two days + 1 hour gives the lead a clean "aged" timestamp on the Open
  // Market side of the boundary, even accounting for small clock drift.
  const boundary = new Date(Date.now() - (2 * 86_400_000 + 3_600_000));
  const noteSuffix = user.role === "MASTER" ? " (master cleared assignments)" : "";

  // Reset is THE one action that moves a lead to the public Open Market —
  // always clear the private channel, whoever clicks it.
  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: lead.id },
      data: { status: "NEW", createdAt: boundary, privateChannelUserId: null },
    });
    // Reset = lead becomes available to the team. Always drop assignments,
    // not just for master — otherwise the resetter stays the assignee and
    // OpenGrouped filters the lead out of their own Market view.
    await tx.leadAssignment.deleteMany({ where: { leadId: lead.id } });
    if (lead.status !== "NEW") {
      await tx.leadStatusChange.create({
        data: {
          leadId: lead.id,
          fromStatus: lead.status,
          toStatus: "NEW",
          note: "Reset to Open Market" + noteSuffix,
          changedById: user.id,
        },
      });
    }
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${lead.id}`);

  // Recirculation event — focused push to creator, broadcast to the team
  // (creator excluded so they only get the focused one).
  after(async () => {
    await notifyLeadCreator({
      leadId: lead.id,
      creatorId: lead.createdById,
      actorId: user.id,
      title: "Your lead is back in Open Market",
      body: `${user.displayName} reset #${lead.id}`,
    });
    const allUsers = await getAllUserIds();
    await sendPushToUsers({
      userIds: allUsers.filter((id) => id !== lead.createdById),
      excludeUserId: user.id,
      payload: {
        title: "Lead back in Open Market",
        body: `${user.displayName} reset lead #${lead.id} for pickup`,
        url: `/dashboard/leads/${lead.id}`,
        kind: "lead",
        tag: `lead-${lead.id}`,
      },
    });
  });
}

/** Any signed-in user can rate a lead's quality. Pass quality="" to clear it. */
const QualityValues = ["GOOD", "MEDIUM", "LOW", ""] as const;
const QualitySchema = z.object({
  leadId: z.coerce.number().int().positive(),
  quality: z.enum(QualityValues),
});

export async function updateLeadQualityAction(formData: FormData): Promise<{ error?: string } | void> {
  const me = await requireUser();
  const parsed = QualitySchema.safeParse({
    leadId: formData.get("leadId"),
    quality: formData.get("quality") ?? "",
  });
  if (!parsed.success) return { error: "Invalid quality." };

  const meta = await loadAccessibleLeadMeta(parsed.data.leadId, me);
  if (!meta) return { error: "Lead not found." };

  await prisma.lead.update({
    where: { id: parsed.data.leadId },
    data: {
      quality: parsed.data.quality === "" ? null : (parsed.data.quality as LeadQuality),
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${parsed.data.leadId}`);

  after(async () => {
    const label = parsed.data.quality === "" ? "cleared" : parsed.data.quality;
    await notifyLeadCreator({
      leadId: parsed.data.leadId,
      creatorId: meta.createdById,
      actorId: me.id,
      title: "Your lead quality was updated",
      body: `${me.displayName} set quality on #${parsed.data.leadId} → ${label}`,
    });
  });
}

const DeleteLeadSchema = z.object({
  leadId: z.coerce.number().int().positive(),
});

export async function deleteLeadAction(formData: FormData): Promise<{ error?: string } | void> {
  const me = await requireUser();
  const parsed = DeleteLeadSchema.safeParse({ leadId: formData.get("leadId") });
  if (!parsed.success) return { error: "Invalid lead." };

  const meta = await loadAccessibleLeadMeta(parsed.data.leadId, me);
  if (!meta) return { error: "Lead not found." };

  // Cascade handles status history & assignments via Prisma's onDelete: Cascade.
  await prisma.lead.delete({ where: { id: parsed.data.leadId } });

  revalidatePath("/dashboard");
  // After delete the detail page won't exist anymore; the client redirects.

  after(async () => {
    // Lead is gone — link the creator to the dashboard, not the dead detail.
    if (meta.createdById === me.id) return;
    await sendPushToUsers({
      userIds: [meta.createdById],
      payload: {
        title: "Your lead was deleted",
        body: `${me.displayName} deleted #${parsed.data.leadId}`,
        url: "/dashboard",
        kind: "lead",
        tag: `lead-${parsed.data.leadId}-creator`,
      },
    });
  });
}

/**
 * Reassign a private-channel lead to another private-channel user, or back
 * to master (= clear privateChannelUserId so the lead returns to the public
 * pool). Caller must be the current channel owner or master. A handover
 * remark is mandatory — recorded in the LeadRemark thread.
 */
const ReassignSchema = z.object({
  leadId: z.coerce.number().int().positive(),
  //  0 = master's private inbox
  // -1 = public pool (privateChannelUserId set to null) — master-only
  //  n = a specific private-channel user's id
  targetUserId: z.coerce.number().int().min(-1),
  // Optional — a handover note is helpful but not required.
  remark: z.string().trim().max(2000).optional().default(""),
});

export async function reassignPrivateLeadAction(
  formData: FormData
): Promise<{ error?: string; ok?: boolean } | void> {
  const me = await requireUser();
  const parsed = ReassignSchema.safeParse({
    leadId: formData.get("leadId"),
    targetUserId: formData.get("targetUserId"),
    remark: formData.get("remark"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid handover." };
  }

  const lead = await prisma.lead.findUnique({
    where: { id: parsed.data.leadId },
    select: { id: true, privateChannelUserId: true, createdById: true },
  });
  if (!lead) return { error: "Lead not found." };

  // Caller must be the current channel owner OR master. Master can also
  // reassign public leads (privateChannelUserId === null).
  const isOwner = lead.privateChannelUserId !== null && lead.privateChannelUserId === me.id;
  if (!isOwner && me.role !== "MASTER") return { error: "Lead not found." };

  const targetId = parsed.data.targetUserId;
  let newOwnerId: number | null;
  let targetLabel: string;
  let assignToUserId: number | null = null;
  if (targetId === -1) {
    // Master-only: drop privacy entirely, lead returns to public pool.
    if (me.role !== "MASTER") return { error: "Only master can send to the public pool." };
    if (lead.privateChannelUserId === null) {
      return { error: "Lead is already in the public pool." };
    }
    newOwnerId = null;
    targetLabel = "Public pool";
  } else if (targetId === 0) {
    // "Send to master" → master's private inbox, NOT public. Also record a
    // master assignment stamped with the sender (assignedById = me) so the
    // inbox can categorize the lead under "Assigned by <sender>".
    const [masterId] = await getMasterIds();
    if (!masterId) return { error: "No master configured." };
    if (masterId === lead.privateChannelUserId) {
      return { error: "Lead is already in master's inbox." };
    }
    newOwnerId = masterId;
    assignToUserId = masterId;
    targetLabel = "Master (private inbox)";
  } else {
    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, displayName: true, isPrivateChannel: true, active: true, role: true },
    });
    if (!target || !target.active || target.role !== "USER") {
      return { error: "Pick a valid user." };
    }
    if (target.isPrivateChannel) {
      if (target.id === lead.privateChannelUserId) {
        return { error: "Lead is already in that pipeline." };
      }
      newOwnerId = target.id;
      targetLabel = target.displayName;
    } else {
      // Regular user — clear privacy and add them as the assignee so the
      // lead shows up in their My Pick Up / Fresh view.
      newOwnerId = null;
      assignToUserId = target.id;
      targetLabel = `${target.displayName} (assigned)`;
    }
  }

  // Transaction: flip the channel, drop stale assignments, persist the
  // handover note in the remark thread.
  await prisma.$transaction([
    prisma.lead.update({
      where: { id: lead.id },
      data: { privateChannelUserId: newOwnerId },
    }),
    prisma.leadAssignment.deleteMany({ where: { leadId: lead.id } }),
    ...(assignToUserId !== null
      ? [
          prisma.leadAssignment.create({
            data: { leadId: lead.id, userId: assignToUserId, assignedById: me.id },
          }),
        ]
      : []),
    prisma.leadRemark.create({
      data: {
        leadId: lead.id,
        authorId: me.id,
        // Remark is optional — keep the handover marker clean when omitted.
        body: parsed.data.remark
          ? `[Reassigned to ${targetLabel}] ${parsed.data.remark}`
          : `[Reassigned to ${targetLabel}]`,
      },
    }),
  ]);

  // Handover resets the alarm: clear any prior owner's reminder on this
  // lead, then give the new private-channel owner a fresh 15-minute nudge
  // (cancelled when they tap OK/Pick). Public-pool sends leave no alarm.
  await prisma.leadReminder.deleteMany({ where: { leadId: lead.id } });
  if (newOwnerId !== null && newOwnerId !== me.id) {
    await prisma.leadReminder.create({
      data: {
        leadId: lead.id,
        userId: newOwnerId,
        remindAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${lead.id}`);

  after(async () => {
    const recipients = new Set<number>();
    if (newOwnerId !== null) recipients.add(newOwnerId);
    else if (assignToUserId !== null) recipients.add(assignToUserId);
    else for (const uid of await getAllUserIds()) recipients.add(uid);
    for (const mid of await getMasterIds()) recipients.add(mid);
    recipients.delete(me.id);
    if (recipients.size > 0) {
      await sendPushToUsers({
        userIds: Array.from(recipients),
        payload: {
          title: "Lead reassigned",
          body: `${me.displayName} handed lead #${lead.id} to ${targetLabel}`,
          url: `/dashboard/leads/${lead.id}`,
          kind: "assign",
          tag: `lead-${lead.id}`,
        },
      });
    }
    await notifyLeadCreator({
      leadId: lead.id,
      creatorId: lead.createdById,
      actorId: me.id,
      title: "Your lead was reassigned",
      body: `${me.displayName} → ${targetLabel}: ${parsed.data.remark.slice(0, 100)}`,
    });
  });

  return { ok: true };
}

/**
 * Master pings the people responsible for a lead: the private-channel
 * owner if it's a private lead, otherwise the assignees, otherwise the
 * whole team (public unclaimed lead). Pure notification — no state.
 */
const PingSchema = z.object({ leadId: z.coerce.number().int().positive() });

export async function pingLeadAction(formData: FormData): Promise<{ error?: string } | void> {
  const master = await requireMaster();
  const parsed = PingSchema.safeParse({ leadId: formData.get("leadId") });
  if (!parsed.success) return { error: "Invalid lead." };

  const lead = await prisma.lead.findUnique({
    where: { id: parsed.data.leadId },
    select: {
      id: true,
      privateChannelUserId: true,
      assignments: { select: { userId: true } },
    },
  });
  if (!lead) return { error: "Lead not found." };

  const recipients =
    lead.privateChannelUserId !== null
      ? [lead.privateChannelUserId]
      : lead.assignments.length > 0
        ? lead.assignments.map((a) => a.userId)
        : await getAllUserIds();

  after(async () => {
    await sendPushToUsers({
      userIds: recipients.filter((id) => id !== master.id),
      payload: {
        title: "Ping from master",
        body: `${master.displayName} wants your attention on lead #${lead.id}`,
        url: `/dashboard/leads/${lead.id}`,
        kind: "lead",
        tag: `lead-${lead.id}-ping`,
      },
    });
  });
}

/**
 * Set (or clear) a personal follow-up reminder on a lead. `hours` must be
 * one of 1|2|3|4, or 0 to clear. Anyone with access to the lead can set
 * their own reminder — it's per-user (unique on leadId,userId), so users
 * don't stomp on each other's alarms.
 */
const ReminderSchema = z.object({
  leadId: z.coerce.number().int().positive(),
  // Total minutes from now. 0 = clear. Cap at a day so a fat-finger can't
  // schedule something a year out.
  // Total minutes from now. 0 clears. Cap ~31 days (covers 30d 23h 45m).
  minutes: z.coerce.number().int().min(0).max(31 * 24 * 60),
});

export async function setReminderAction(
  formData: FormData
): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const parsed = ReminderSchema.safeParse({
    leadId: formData.get("leadId"),
    minutes: formData.get("minutes"),
  });
  if (!parsed.success) return { error: "Invalid reminder." };

  const meta = await loadAccessibleLeadMeta(parsed.data.leadId, user);
  if (!meta) return { error: "Lead not found." };

  if (parsed.data.minutes === 0) {
    await prisma.leadReminder.deleteMany({
      where: { leadId: parsed.data.leadId, userId: user.id },
    });
  } else {
    const remindAt = new Date(Date.now() + parsed.data.minutes * 60_000);
    await prisma.leadReminder.upsert({
      where: {
        leadId_userId: { leadId: parsed.data.leadId, userId: user.id },
      },
      update: { remindAt },
      create: { leadId: parsed.data.leadId, userId: user.id, remindAt },
    });
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${parsed.data.leadId}`);
}

/** Master taps OK → the user who put in the lead gets a confirmation. */
export async function masterOkLeadAction(formData: FormData): Promise<{ error?: string } | void> {
  const master = await requireMaster();
  const parsed = PingSchema.safeParse({ leadId: formData.get("leadId") });
  if (!parsed.success) return { error: "Invalid lead." };

  const lead = await prisma.lead.findUnique({
    where: { id: parsed.data.leadId },
    select: { id: true, createdById: true },
  });
  if (!lead) return { error: "Lead not found." };

  after(async () => {
    await notifyLeadCreator({
      leadId: lead.id,
      creatorId: lead.createdById,
      actorId: master.id,
      title: "Lead confirmed",
      body: `${master.displayName} marked your lead #${lead.id} as OK`,
      kind: "pickup",
    });
  });
}
