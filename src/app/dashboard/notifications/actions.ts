"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const OpenSchema = z.object({
  id: z.coerce.number().int().positive(),
  // Optional. If present, the action redirects there after removing so a
  // click on the notification both consumes it AND opens the lead.
  // ponytail: only same-origin paths allowed — prevents open-redirect abuse
  // from a forged form post.
  url: z.string().regex(/^\/[^\s]*$/).optional(),
});

/**
 * Reading a notification removes it: open its lead (if any) and delete the
 * row so the next-oldest notification surfaces into view. deleteMany with
 * userId in the WHERE clause scopes it to the caller's own rows — a forged
 * id from someone else's feed matches nothing.
 */
export async function openNotificationAction(formData: FormData): Promise<void> {
  const me = await requireUser();
  const parsed = OpenSchema.safeParse({
    id: formData.get("id"),
    url: formData.get("url") || undefined,
  });
  if (!parsed.success) return;
  await prisma.notification.deleteMany({
    where: { id: parsed.data.id, userId: me.id },
  });
  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard");
  if (parsed.data.url) redirect(parsed.data.url);
}

const DeleteOneSchema = z.object({ id: z.coerce.number().int().positive() });

/**
 * Permanently remove one notification. Read or unread — deletion is the
 * only thing that takes a row out of the history; marking read just dims
 * it. userId in the WHERE clause scopes it to the caller's own rows.
 */
export async function deleteNotificationAction(formData: FormData): Promise<void> {
  const me = await requireUser();
  const parsed = DeleteOneSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  await prisma.notification.deleteMany({
    where: { id: parsed.data.id, userId: me.id },
  });
  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard");
}

/** Clear the whole history for the current user. */
export async function deleteAllNotificationsAction(): Promise<void> {
  const me = await requireUser();
  await prisma.notification.deleteMany({ where: { userId: me.id } });
  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard");
}
