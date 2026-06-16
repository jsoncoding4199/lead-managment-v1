"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireMaster } from "@/lib/auth";

const CreateUserSchema = z.object({
  username: z.string().trim().toLowerCase().min(2).max(40).regex(/^[a-z0-9._-]+$/, "lowercase letters, digits, . _ - only"),
  displayName: z.string().trim().min(1).max(60),
  password: z.string().min(6).max(200),
  channel: z.enum(["DEFAULT", "AHA", "AHB"]).optional(),
});

export async function createUserAction(_prev: { error?: string; ok?: boolean } | null, formData: FormData) {
  await requireMaster();
  const parsed = CreateUserSchema.safeParse({
    username: formData.get("username"),
    displayName: formData.get("displayName"),
    password: formData.get("password"),
    channel: formData.get("channel") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const exists = await prisma.user.findUnique({ where: { username: parsed.data.username } });
  if (exists) return { error: "That username is already taken." };

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.create({
    data: {
      username: parsed.data.username,
      displayName: parsed.data.displayName,
      passwordHash,
      role: "USER",
      channel: parsed.data.channel ?? "DEFAULT",
    },
  });

  revalidatePath("/dashboard/admin");
  return { ok: true };
}

const SetActiveSchema = z.object({
  userId: z.coerce.number().int().positive(),
  active: z.enum(["true", "false"]),
});

export async function setUserActiveAction(formData: FormData) {
  await requireMaster();
  const parsed = SetActiveSchema.safeParse({
    userId: formData.get("userId"),
    active: formData.get("active"),
  });
  if (!parsed.success) return;

  await prisma.user.update({
    where: { id: parsed.data.userId },
    data: { active: parsed.data.active === "true" },
  });
  revalidatePath("/dashboard/admin");
}

const ResetPasswordSchema = z.object({
  userId: z.coerce.number().int().positive(),
  password: z.string().min(6).max(200),
  resetRequestId: z.coerce.number().int().positive().optional(),
});

export async function resetUserPasswordAction(_prev: { error?: string; ok?: boolean } | null, formData: FormData) {
  const master = await requireMaster();
  const parsed = ResetPasswordSchema.safeParse({
    userId: formData.get("userId"),
    password: formData.get("password"),
    resetRequestId: formData.get("resetRequestId") || undefined,
  });
  if (!parsed.success) return { error: "Password must be at least 6 characters." };

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.update({
    where: { id: parsed.data.userId },
    data: { passwordHash },
  });

  if (parsed.data.resetRequestId) {
    await prisma.passwordResetRequest.update({
      where: { id: parsed.data.resetRequestId },
      data: { resolvedAt: new Date(), resolvedById: master.id },
    });
  } else {
    // Resolve any pending requests for this user.
    await prisma.passwordResetRequest.updateMany({
      where: { userId: parsed.data.userId, resolvedAt: null },
      data: { resolvedAt: new Date(), resolvedById: master.id },
    });
  }

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/admin/resets");
  return { ok: true };
}

/**
 * Hard-delete a user. Reassigns ownership of their leads + audit-trail rows
 * to the master so foreign-key constraints don't block the delete. Their
 * pickup-assignments and pending password-reset requests cascade away.
 *
 * The master cannot delete themselves. Other MASTER accounts also can't be
 * deleted through this UI (we hide the button), but we double-check here too.
 */
/** Master can rename users and change their channel assignment. */
const EditUserSchema = z.object({
  userId: z.coerce.number().int().positive(),
  username: z.string().trim().toLowerCase().min(2).max(40).regex(/^[a-z0-9._-]+$/, "lowercase letters, digits, . _ - only"),
  displayName: z.string().trim().min(1).max(60),
  channel: z.enum(["DEFAULT", "AHA", "AHB"]).optional(),
});

export async function editUserAction(formData: FormData): Promise<{ error?: string; ok?: boolean } | void> {
  const master = await requireMaster();
  const parsed = EditUserSchema.safeParse({
    userId: formData.get("userId"),
    username: formData.get("username"),
    displayName: formData.get("displayName"),
    channel: formData.get("channel") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const target = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!target) return { error: "User not found." };
  if (target.role === "MASTER" && target.id !== master.id) {
    return { error: "Other master accounts can't be edited from here." };
  }

  if (parsed.data.username !== target.username) {
    const clash = await prisma.user.findUnique({ where: { username: parsed.data.username } });
    if (clash && clash.id !== target.id) {
      return { error: "That username is already taken." };
    }
  }

  // Master ignores the channel field (their access is unconditional);
  // non-master users get their channel set or left alone if not provided.
  const channelUpdate =
    parsed.data.channel && target.role !== "MASTER"
      ? { channel: parsed.data.channel }
      : {};

  await prisma.user.update({
    where: { id: target.id },
    data: {
      username: parsed.data.username,
      displayName: parsed.data.displayName,
      ...channelUpdate,
    },
  });

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard");
  return { ok: true };
}

const DeleteUserSchema = z.object({
  userId: z.coerce.number().int().positive(),
});

export async function deleteUserAction(formData: FormData): Promise<{ error?: string } | void> {
  const master = await requireMaster();
  const parsed = DeleteUserSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { error: "Invalid user." };

  if (parsed.data.userId === master.id) {
    return { error: "You can't delete your own account." };
  }

  const target = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!target) return { error: "User not found." };
  if (target.role === "MASTER") {
    return { error: "Master accounts can't be deleted through the UI." };
  }

  // Transfer FK references to master, then delete. Cascade handles
  // LeadAssignment (where target was an assignee) and PasswordResetRequest
  // (where target is the subject).
  await prisma.$transaction(async (tx) => {
    await tx.lead.updateMany({
      where: { createdById: target.id },
      data: { createdById: master.id },
    });
    await tx.leadStatusChange.updateMany({
      where: { changedById: target.id },
      data: { changedById: master.id },
    });
    await tx.leadAssignment.updateMany({
      where: { assignedById: target.id },
      data: { assignedById: master.id },
    });
    await tx.passwordResetRequest.updateMany({
      where: { resolvedById: target.id },
      data: { resolvedById: master.id },
    });
    await tx.user.delete({ where: { id: target.id } });
  });

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard");
}
