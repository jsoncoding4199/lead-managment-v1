"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Mark every still-unread notification for the current user as read.
 * Scoped strictly to the caller's own rows so a malicious form post can't
 * touch anyone else's feed.
 */
export async function markNotificationsReadAction(): Promise<void> {
  const me = await requireUser();
  await prisma.notification.updateMany({
    where: { userId: me.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard");
}

const MarkOneSchema = z.object({
  id: z.coerce.number().int().positive(),
  // Optional. If present, the action redirects there after marking read so
  // a click on the notification message both clears it AND opens the lead.
  // ponytail: only same-origin paths allowed — prevents open-redirect abuse
  // from a forged form post.
  url: z.string().regex(/^\/[^\s]*$/).optional(),
});

/**
 * Mark a single notification as read. updateMany with userId in the WHERE
 * clause means a forged id from someone else's row simply matches zero
 * rows — no info leak, no error needed.
 */
export async function markNotificationReadAction(formData: FormData): Promise<void> {
  const me = await requireUser();
  const parsed = MarkOneSchema.safeParse({
    id: formData.get("id"),
    url: formData.get("url") || undefined,
  });
  if (!parsed.success) return;
  await prisma.notification.updateMany({
    where: { id: parsed.data.id, userId: me.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard");
  if (parsed.data.url) redirect(parsed.data.url);
}
