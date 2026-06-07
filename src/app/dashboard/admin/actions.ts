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
});

export async function createUserAction(_prev: { error?: string; ok?: boolean } | null, formData: FormData) {
  await requireMaster();
  const parsed = CreateUserSchema.safeParse({
    username: formData.get("username"),
    displayName: formData.get("displayName"),
    password: formData.get("password"),
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
