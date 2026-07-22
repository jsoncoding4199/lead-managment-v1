/**
 * Vercel-cron endpoint. Sweeps LeadReminder rows whose remindAt has
 * passed: sends a push to the owning user for each, then deletes the row.
 *
 * Scheduled every 5 minutes via vercel.json. Vercel-cron requests carry
 * `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set — we accept
 * unauthenticated calls only in dev. Never exposes lead content to any user
 * who wasn't already the reminder's owner.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/webPush";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const due = await prisma.leadReminder.findMany({
    where: { remindAt: { lte: now } },
    select: { id: true, leadId: true, userId: true },
    take: 200,
  });

  if (due.length === 0) return NextResponse.json({ fired: 0 });

  // Group by user so each user gets one push per lead. LeadReminder is
  // unique(leadId, userId), so at most one per user per lead already.
  await Promise.all(
    due.map((r) =>
      sendPushToUsers({
        userIds: [r.userId],
        payload: {
          title: "Follow up reminder",
          body: `Time to follow up on lead #${r.leadId}`,
          url: `/dashboard/leads/${r.leadId}`,
          kind: "lead",
          tag: `lead-${r.leadId}-reminder`,
        },
      })
    )
  );

  await prisma.leadReminder.deleteMany({
    where: { id: { in: due.map((r) => r.id) } },
  });

  return NextResponse.json({ fired: due.length });
}
