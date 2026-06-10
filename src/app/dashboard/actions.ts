"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { LeadStatus, LeadQuality } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser, requireMaster } from "@/lib/auth";
import { STATUS_LABEL } from "@/lib/leadStatus";
import { sendPushToUsers, getAllUserIds, getMasterIds } from "@/lib/webPush";

const CreateSchema = z.object({
  content: z.string().trim().min(1, "Paste something into the lead.").max(8000),
});

export async function createLeadAction(formData: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const parsed = CreateSchema.safeParse({ content: formData.get("content") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const lead = await prisma.lead.create({
    data: {
      content: parsed.data.content,
      status: "NEW",
      createdById: user.id,
    },
  });

  revalidatePath("/dashboard");

  // Fire-and-forget push to everyone except the creator.
  void sendPushToUsers({
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

  if (lead.status === parsed.data.status) {
    return; // no-op
  }

  await prisma.$transaction([
    prisma.lead.update({
      where: { id: lead.id },
      data: { status: parsed.data.status as LeadStatus },
    }),
    prisma.leadStatusChange.create({
      data: {
        leadId: lead.id,
        fromStatus: lead.status,
        toStatus: parsed.data.status as LeadStatus,
        note: parsed.data.note,
        changedById: user.id,
      },
    }),
  ]);

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${lead.id}`);

  // Push: master-only for APPROVED, everyone else for normal transitions.
  const toStatus = parsed.data.status as LeadStatus;
  if (toStatus === "APPROVED") {
    void sendPushToUsers({
      userIds: await getMasterIds(),
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
    void sendPushToUsers({
      userIds: await getAllUserIds(),
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
  if (lead.status === "APPROVED" && me.role !== "MASTER") {
    return { error: "This lead is already closed." };
  }
  if (existing) return; // already picked up — no-op

  const count = await prisma.leadAssignment.count({ where: { leadId: lead.id } });
  if (count >= settings.maxPickup) {
    return { error: `This lead is already at capacity (${settings.maxPickup}).` };
  }

  await prisma.leadAssignment.create({
    data: {
      leadId: lead.id,
      userId: me.id,
      assignedById: me.id, // self-assigned
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${lead.id}`);
}

/** Self-drop (un-assign) a lead. Any signed-in user can drop themselves. */
const DropSchema = z.object({ leadId: z.coerce.number().int().positive() });

export async function dropLeadAction(formData: FormData): Promise<{ error?: string } | void> {
  const me = await requireUser();
  const parsed = DropSchema.safeParse({ leadId: formData.get("leadId") });
  if (!parsed.success) return { error: "Invalid lead." };

  await prisma.leadAssignment.deleteMany({
    where: { leadId: parsed.data.leadId, userId: me.id },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${parsed.data.leadId}`);
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

const RemarkSchema = z.object({
  leadId: z.coerce.number().int().positive(),
  remark: z.string().trim().max(2000),
});

export async function updateRemarkAction(formData: FormData): Promise<{ error?: string } | void> {
  await requireUser();
  const parsed = RemarkSchema.safeParse({
    leadId: formData.get("leadId"),
    remark: formData.get("remark"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid remark." };

  await prisma.lead.update({
    where: { id: parsed.data.leadId },
    data: { remark: parsed.data.remark.length === 0 ? null : parsed.data.remark },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${parsed.data.leadId}`);
}

const EditContentSchema = z.object({
  leadId: z.coerce.number().int().positive(),
  content: z.string().trim().min(1, "Lead content can't be empty.").max(8000),
});

export async function editLeadContentAction(formData: FormData): Promise<{ error?: string } | void> {
  await requireUser();
  const parsed = EditContentSchema.safeParse({
    leadId: formData.get("leadId"),
    content: formData.get("content"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid content." };

  await prisma.lead.update({
    where: { id: parsed.data.leadId },
    data: { content: parsed.data.content },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${parsed.data.leadId}`);
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

  // Two days + 1 hour gives the lead a clean "aged" timestamp on the Open
  // Market side of the boundary, even accounting for small clock drift.
  const boundary = new Date(Date.now() - (2 * 86_400_000 + 3_600_000));
  const noteSuffix = user.role === "MASTER" ? " (master cleared assignments)" : "";

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: lead.id },
      data: { status: "NEW", createdAt: boundary },
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

  // Recirculation event — broadcast to everyone so they know the lead is
  // back in the pool.
  void sendPushToUsers({
    userIds: await getAllUserIds(),
    excludeUserId: user.id,
    payload: {
      title: "Lead back in Open Market",
      body: `${user.displayName} reset lead #${lead.id} for pickup`,
      url: `/dashboard/leads/${lead.id}`,
      kind: "lead",
      tag: `lead-${lead.id}`,
    },
  });
}

/** Any signed-in user can rate a lead's quality. Pass quality="" to clear it. */
const QualityValues = ["GOOD", "MEDIUM", "LOW", ""] as const;
const QualitySchema = z.object({
  leadId: z.coerce.number().int().positive(),
  quality: z.enum(QualityValues),
});

export async function updateLeadQualityAction(formData: FormData): Promise<{ error?: string } | void> {
  await requireUser();
  const parsed = QualitySchema.safeParse({
    leadId: formData.get("leadId"),
    quality: formData.get("quality") ?? "",
  });
  if (!parsed.success) return { error: "Invalid quality." };

  await prisma.lead.update({
    where: { id: parsed.data.leadId },
    data: {
      quality: parsed.data.quality === "" ? null : (parsed.data.quality as LeadQuality),
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${parsed.data.leadId}`);
}

const DeleteLeadSchema = z.object({
  leadId: z.coerce.number().int().positive(),
});

export async function deleteLeadAction(formData: FormData): Promise<{ error?: string } | void> {
  await requireUser();
  const parsed = DeleteLeadSchema.safeParse({ leadId: formData.get("leadId") });
  if (!parsed.success) return { error: "Invalid lead." };

  // Cascade handles status history & assignments via Prisma's onDelete: Cascade.
  await prisma.lead.delete({ where: { id: parsed.data.leadId } });

  revalidatePath("/dashboard");
  // After delete the detail page won't exist anymore; the client redirects.
}
