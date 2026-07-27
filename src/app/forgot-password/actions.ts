"use server";

import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const RequestSchema = z.object({
  username: z.string().trim().min(1).max(60),
});

export type RequestState = { ok?: boolean; error?: string };

export async function requestResetAction(_prev: RequestState, formData: FormData): Promise<RequestState> {
  const parsed = RequestSchema.safeParse({ username: formData.get("username") });
  if (!parsed.success) return { error: "Please enter your username." };

  const user = await prisma.user.findUnique({ where: { username: parsed.data.username } });

  // Always return ok to avoid leaking which usernames exist.
  if (user && user.active) {
    const existing = await prisma.passwordResetRequest.findFirst({
      where: { userId: user.id, resolvedAt: null },
    });
    if (!existing) {
      await prisma.passwordResetRequest.create({ data: { userId: user.id } });
    }
  }

  return { ok: true };
}

/**
 * Master self-recovery when locked out. The request-based flow above can't
 * help the master — only a signed-in master can resolve requests, so a
 * locked-out master would deadlock. Here they prove identity with a secret
 * recovery code (MASTER_RECOVERY_CODE in the server env) and set a new
 * password directly. Works from a phone, no email service needed.
 *
 * ponytail: no rate limit — the code is a high-entropy shared secret, not a
 * guessable PIN. Add a per-IP throttle if this ever faces the open internet
 * with a weak code.
 */
const RecoverSchema = z
  .object({
    username: z.string().trim().min(1, "Enter your username.").max(60),
    code: z.string().min(1, "Enter your recovery code."),
    newPassword: z.string().min(6, "New password must be at least 6 characters.").max(200),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "New password and confirmation don't match.",
    path: ["confirmPassword"],
  });

/** Constant-time string compare that never short-circuits on length. */
function codeMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Still burn a compare against `a` so timing doesn't leak length.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export async function masterRecoverAction(
  _prev: RequestState,
  formData: FormData
): Promise<RequestState> {
  const parsed = RecoverSchema.safeParse({
    username: formData.get("username"),
    code: formData.get("code"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const expected = process.env.MASTER_RECOVERY_CODE;
  // Feature is off until a code is configured. Generic message — don't
  // reveal whether the code exists, the username exists, or it's a master.
  const GENERIC = "Recovery failed. Check your username and recovery code.";
  if (!expected || expected.length < 8) return { error: GENERIC };

  const user = await prisma.user.findUnique({
    where: { username: parsed.data.username },
    select: { id: true, role: true, active: true },
  });
  const okUser = !!user && user.active && user.role === "MASTER";
  const okCode = codeMatches(parsed.data.code, expected);
  // Evaluate both regardless of the user lookup so a wrong username and a
  // wrong code fail the same way.
  if (!okUser || !okCode) return { error: GENERIC };

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({ where: { id: user!.id }, data: { passwordHash } });
  // Clear any pending self-reset request the master may have filed.
  await prisma.passwordResetRequest.updateMany({
    where: { userId: user!.id, resolvedAt: null },
    data: { resolvedAt: new Date(), resolvedById: user!.id },
  });

  return { ok: true };
}
