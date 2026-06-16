"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import type { LeadStatus, LeadQuality } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser, requireMaster } from "@/lib/auth";
import {
  STATUS_LABEL,
  TRANSFER_TO_MARKET_STATUSES,
  ALWAYS_ARCHIVED_STATUSES,
} from "@/lib/leadStatus";
import { sendPushToUsers, getAllUserIds, getMasterIds } from "@/lib/webPush";
import { CHANNEL_OWNERS, canAccessLeadChannel, type ChannelKey } from "@/lib/channels";

/**
 * True when the actor is the AHA / AHB channel owner (and not master)
 * working on a lead in their own private channel. Used to decide whether
 * an outbound transition (NOT_ABLE / SPAM / REJECTED / APPROVED / Reset)
 * should also kick the lead back to the public DEFAULT channel.
 *
 * Master never auto-flips a channel — they manage explicitly.
 */
function isChannelOwnerActing(
  actor: { id: number; username: string; displayName: string; role: "MASTER" | "USER" },
  channel: import("@prisma/client").LeadChannel
): boolean {
  if (channel === "DEFAULT") return false;
  if (actor.role === "MASTER") return false;
  return canAccessLeadChannel(actor, channel);
}

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
  kind?: "status" | "lead" | "approved";
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
  user: { id: number; username: string; displayName: string; role: "MASTER" | "USER" }
): Promise<{
  channel: import("@prisma/client").LeadChannel;
  status: LeadStatus;
  createdById: number;
} | null> {
  const meta = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { channel: true, status: true, createdById: true },
  });
  if (!meta) return null;
  if (!canAccessLeadChannel(user, meta.channel)) return null;
  return meta;
}

const CreateSchema = z.object({
  content: z.string().trim().min(1, "Paste something into the lead.").max(8000),
  channel: z.enum(["DEFAULT", "AHA", "AHB"]).optional(),
});

export async function createLeadAction(formData: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const rawChannel = formData.get("channel");
  const parsed = CreateSchema.safeParse({
    content: formData.get("content"),
    channel: rawChannel || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const channel = parsed.data.channel ?? "DEFAULT";
  // Only master can drop into private channels — anyone else gets forced
  // back to the default pipeline regardless of what the form sent.
  if (channel !== "DEFAULT" && user.role !== "MASTER") {
    return { error: "Only the master can create leads in this channel." };
  }

  const lead = await prisma.lead.create({
    data: {
      content: parsed.data.content,
      status: "NEW",
      channel,
      createdById: user.id,
    },
  });

  revalidatePath("/dashboard");

  // Push runs AFTER the action response is sent — never blocks the click.
  // For private channels, only the channel owner (+ master implicitly via
  // self-exclude) get notified, not the whole team.
  const channelKey = (channel === "AHA" || channel === "AHB" ? channel : null) as ChannelKey | null;
  after(async () => {
    if (channelKey) {
      const owner = await prisma.user.findFirst({
        where: {
          OR: [
            { displayName: CHANNEL_OWNERS[channelKey] },
            { username: CHANNEL_OWNERS[channelKey] },
          ],
          active: true,
        },
        select: { id: true },
      });
      if (owner) {
        await sendPushToUsers({
          userIds: [owner.id],
          excludeUserId: user.id,
          payload: {
            title: `New ${channelKey} lead`,
            body: `Master added lead #${lead.id} to your ${channelKey} channel`,
            url: `/dashboard/leads/${lead.id}`,
            kind: "lead",
            tag: `lead-${lead.id}`,
          },
        });
      }
      return;
    }
    await sendPushToUsers({
      userIds: await getAllUserIds(),
      excludeUserId: user.id,
      payload: {
        title: "New lead",
        body: `${user.displayName} added lead #${lead.id} in Fresh`,
        url: `/dashboard/leads/${lead.id}`,
        kind: "lead",
        tag: `lead-${lead.id}`,
      },
    });
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
  if (!canAccessLeadChannel(user, lead.channel)) return { error: "Lead not found." };

  if (lead.status === parsed.data.status) {
    return; // no-op
  }

  // Reject must always carry a written reason. Enforced both client- and
  // server-side so a malicious client can't bypass the prompt.
  if (parsed.data.status === "REJECTED" && !parsed.data.note?.trim()) {
    return { error: "A rejection reason is required." };
  }

  // When a lead moves to a "transfer-to-Market" status, backdate createdAt
  // past the Fresh/Open-Market boundary so it lands directly in Open Market
  // (regardless of its original age). The team can then re-pick it up.
  const newStatus = parsed.data.status as LeadStatus;
  const transferToMarket = TRANSFER_TO_MARKET_STATUSES.includes(newStatus);
  const isOutboundFromChannel =
    transferToMarket || ALWAYS_ARCHIVED_STATUSES.includes(newStatus);
  // Adam / Eddie working on their own AHA / AHB lead: outbound transitions
  // (NOT_ABLE / SPAM / REJECTED / APPROVED) flip the lead back to the
  // public DEFAULT channel so it shows up in Open Market or Archive for
  // the team. Master's actions never auto-flip.
  const flipChannelToDefault =
    isOutboundFromChannel && isChannelOwnerActing(user, lead.channel);
  const marketBackdate = transferToMarket
    ? new Date(Date.now() - (2 * 86_400_000 + 3_600_000))
    : null;

  type LeadUpdate = {
    status: LeadStatus;
    createdAt?: Date;
    channel?: "DEFAULT";
  };
  const leadUpdate: LeadUpdate = { status: newStatus };
  if (marketBackdate) leadUpdate.createdAt = marketBackdate;
  if (flipChannelToDefault) leadUpdate.channel = "DEFAULT";

  await prisma.$transaction([
    prisma.lead.update({
      where: { id: lead.id },
      data: leadUpdate,
    }),
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

  revalidatePath("/dashboard");
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
  if (!canAccessLeadChannel(me, lead.channel)) return { error: "Lead not found." };
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
    });
  });
}

/**
 * Drop a self-assignment, but only after the user has explicitly picked a
 * "final" status for the lead. We require this so leads don't get dropped
 * while still in NEW / an ABLE state — every drop now ends with a recorded
 * outcome (e.g. CONTACT_NOT_ABLE, SPAM_OR_MISSING, REJECTED).
 *
 * Done atomically:
 *   1. Update the lead's status (with optional Market backdate if the
 *      target status is in TRANSFER_TO_MARKET_STATUSES). Skipped if the
 *      lead is already at that status — no LeadStatusChange row in that case.
 *   2. Delete the user's leadAssignment row.
 *   3. Increment User.dropsCount if a row was actually deleted.
 */
const DropWithStatusSchema = z.object({
  leadId: z.coerce.number().int().positive(),
  status: z.enum(StatusValues),
  note: z.string().trim().max(500).optional(),
});

export async function dropWithStatusAction(input: {
  leadId: number;
  status: LeadStatus;
  note?: string;
}): Promise<{ error?: string } | void> {
  const me = await requireUser();
  const parsed = DropWithStatusSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid drop." };

  const lead = await prisma.lead.findUnique({ where: { id: parsed.data.leadId } });
  if (!lead) return { error: "Lead not found." };
  if (!canAccessLeadChannel(me, lead.channel)) return { error: "Lead not found." };

  const newStatus = parsed.data.status as LeadStatus;
  const statusChanged = lead.status !== newStatus;

  // Reject requires a reason, even on drop-with-status.
  if (statusChanged && newStatus === "REJECTED" && !parsed.data.note?.trim()) {
    return { error: "A rejection reason is required." };
  }
  const transferToMarket = statusChanged && TRANSFER_TO_MARKET_STATUSES.includes(newStatus);
  // Channel-owner drop with an outbound status flips the lead's channel
  // back to public DEFAULT so the rest of the team can see it (Market for
  // soft-negative, Archive for REJECTED / APPROVED). Runs even if the
  // status didn't change — e.g. Adam drops a CONTACT_NOT_ABLE lead with
  // the same status, the lead still leaves the private AHA channel.
  const isOutboundChoice =
    TRANSFER_TO_MARKET_STATUSES.includes(newStatus) ||
    ALWAYS_ARCHIVED_STATUSES.includes(newStatus);
  const flipChannelToDefault =
    isOutboundChoice && isChannelOwnerActing(me, lead.channel);
  const marketBackdate = transferToMarket
    ? new Date(Date.now() - (2 * 86_400_000 + 3_600_000))
    : null;
  const needsLeadUpdate = statusChanged || flipChannelToDefault;

  type LeadUpdate = {
    status?: LeadStatus;
    createdAt?: Date;
    channel?: "DEFAULT";
  };

  await prisma.$transaction(async (tx) => {
    if (needsLeadUpdate) {
      const leadUpdate: LeadUpdate = {};
      if (statusChanged) leadUpdate.status = newStatus;
      if (marketBackdate) leadUpdate.createdAt = marketBackdate;
      if (flipChannelToDefault) leadUpdate.channel = "DEFAULT";
      await tx.lead.update({
        where: { id: lead.id },
        data: leadUpdate,
      });
    }
    if (statusChanged) {
      await tx.leadStatusChange.create({
        data: {
          leadId: lead.id,
          fromStatus: lead.status,
          toStatus: newStatus,
          note: parsed.data.note,
          changedById: me.id,
        },
      });
    }
    const result = await tx.leadAssignment.deleteMany({
      where: { leadId: lead.id, userId: me.id },
    });
    if (result.count > 0) {
      await tx.user.update({
        where: { id: me.id },
        data: { dropsCount: { increment: 1 } },
      });
      await tx.lead.update({
        where: { id: lead.id },
        data: { dropsCount: { increment: 1 } },
      });
    }
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${lead.id}`);

  // Push runs after the response.
  //   1. Focused push to the creator (they always learn about the drop).
  //   2. Broadcast to the rest of the team — masters only on APPROVED,
  //      everyone else otherwise. Creator excluded from broadcast.
  if (statusChanged) {
    after(async () => {
      const reason = parsed.data.note?.trim() || STATUS_LABEL[newStatus];
      const focusedTitle =
        newStatus === "APPROVED" ? "Your lead was approved 🎉" :
        newStatus === "REJECTED" ? "Your lead was rejected" :
        "Your lead was dropped";
      await notifyLeadCreator({
        leadId: lead.id,
        creatorId: lead.createdById,
        actorId: me.id,
        title: focusedTitle,
        body: `${me.displayName} · #${lead.id}: ${reason}`,
        kind: newStatus === "APPROVED" ? "approved" : "status",
      });

      if (newStatus === "APPROVED") {
        const masterIds = await getMasterIds();
        await sendPushToUsers({
          userIds: masterIds.filter((id) => id !== lead.createdById),
          excludeUserId: me.id,
          payload: {
            title: "Lead approved 🎉",
            body: `${me.displayName} approved lead #${lead.id}`,
            url: `/dashboard/leads/${lead.id}`,
            kind: "approved",
            tag: `lead-${lead.id}`,
          },
        });
      } else {
        const allUsers = await getAllUserIds();
        await sendPushToUsers({
          userIds: allUsers.filter((id) => id !== lead.createdById),
          excludeUserId: me.id,
          payload: {
            title: "Lead status changed",
            body: `${me.displayName} moved #${lead.id} → ${STATUS_LABEL[newStatus]}`,
            url: `/dashboard/leads/${lead.id}`,
            kind: "status",
            tag: `lead-${lead.id}`,
          },
        });
      }
    });
  }
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
  if (!canAccessLeadChannel(user, lead.channel)) return { error: "Lead not found." };

  // Two days + 1 hour gives the lead a clean "aged" timestamp on the Open
  // Market side of the boundary, even accounting for small clock drift.
  const boundary = new Date(Date.now() - (2 * 86_400_000 + 3_600_000));
  const noteSuffix = user.role === "MASTER" ? " (master cleared assignments)" : "";

  // Channel owner resetting their own private lead: flip back to DEFAULT so
  // the lead lands in the public Open Market for the whole team.
  const flipChannelToDefault = isChannelOwnerActing(user, lead.channel);

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: lead.id },
      data: flipChannelToDefault
        ? { status: "NEW", createdAt: boundary, channel: "DEFAULT" }
        : { status: "NEW", createdAt: boundary },
    });
    if (user.role === "MASTER") {
      await tx.leadAssignment.deleteMany({ where: { leadId: lead.id } });
    }
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
