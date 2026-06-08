"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

const CommentSchema = z.object({
  leadId: z.coerce.number().int().positive(),
  body: z.string().trim().min(1, "Comment can't be empty.").max(2000, "Comment is too long."),
});

export async function addCommentAction(formData: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const parsed = CommentSchema.safeParse({
    leadId: formData.get("leadId"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid comment." };

  const lead = await prisma.lead.findUnique({ where: { id: parsed.data.leadId } });
  if (!lead) return { error: "Lead not found." };

  await prisma.leadComment.create({
    data: {
      leadId: parsed.data.leadId,
      authorId: user.id,
      body: parsed.data.body,
    },
  });

  revalidatePath(`/dashboard/leads/${parsed.data.leadId}`);
}

const DeleteSchema = z.object({
  commentId: z.coerce.number().int().positive(),
  leadId: z.coerce.number().int().positive(),
});

export async function deleteCommentAction(formData: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const parsed = DeleteSchema.safeParse({
    commentId: formData.get("commentId"),
    leadId: formData.get("leadId"),
  });
  if (!parsed.success) return { error: "Invalid request." };

  const comment = await prisma.leadComment.findUnique({ where: { id: parsed.data.commentId } });
  if (!comment) return; // already gone, no-op

  // Only the author or master can delete a comment.
  if (comment.authorId !== user.id && user.role !== "MASTER") {
    return { error: "Only the author or the master can delete this comment." };
  }

  await prisma.leadComment.delete({ where: { id: parsed.data.commentId } });
  revalidatePath(`/dashboard/leads/${parsed.data.leadId}`);
}
