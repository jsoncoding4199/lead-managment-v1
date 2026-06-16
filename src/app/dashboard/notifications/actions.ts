"use server";

import { revalidatePath } from "next/cache";
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
