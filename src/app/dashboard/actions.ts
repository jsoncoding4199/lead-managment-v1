"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser, requireMaster } from "@/lib/auth";

const CreateSchema = z.object({
  content: z.string().trim().min(1, "Paste something into the lead.").max(8000),
});

export async function createLeadAction(formData: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const parsed = CreateSchema.safeParse({ content: formData.get("content") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await prisma.lead.create({
    data: {
      content: parsed.data.content,
      status: "NEW",
      createdById: user.id,
    },
  });

  revalidatePath("/dashboard");
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
}

const AssignSchema = z.object({
  leadId: z.coerce.number().int().positive(),
  assigneeId: z.string(),
});

export async function assignLeadAction(formData: FormData): Promise<{ error?: string } | void> {
  await requireMaster();
  const parsed = AssignSchema.safeParse({
    leadId: formData.get("leadId"),
    assigneeId: formData.get("assigneeId"),
  });
  if (!parsed.success) return { error: "Invalid assignment." };

  const id = parsed.data.assigneeId === "" ? null : Number(parsed.data.assigneeId);
  if (id !== null && !Number.isFinite(id)) return { error: "Invalid assignee." };

  await prisma.lead.update({
    where: { id: parsed.data.leadId },
    data: { assignedToId: id },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${parsed.data.leadId}`);
}
