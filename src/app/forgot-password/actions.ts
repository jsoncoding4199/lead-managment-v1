"use server";

import { z } from "zod";
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
