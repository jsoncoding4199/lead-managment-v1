/**
 * Server-only Web Push helper. Sends notifications to all subscriptions
 * stored in the database, optionally excluding a specific user (typically
 * the one who initiated the action so we don't self-notify).
 *
 * Required env vars:
 *   VAPID_PUBLIC_KEY              the base64url public key
 *   VAPID_PRIVATE_KEY             the base64url private key
 *   VAPID_SUBJECT (optional)      mailto: contact for push providers
 *                                 (defaults to mailto:admin@leadboard.app)
 */
import webPush from "web-push";
import { prisma } from "./prisma";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@leadboard.app";
  if (!pub || !priv) {
    throw new Error("VAPID keys missing — set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.");
  }
  webPush.setVapidDetails(subject, pub, priv);
  configured = true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  kind?: "status" | "lead" | "approved";
  tag?: string;
};

/**
 * Best-effort push: fires all messages in parallel, swallows individual
 * failures (e.g. expired subscriptions), and deletes subscriptions that
 * the push service rejects with 404/410 (Gone).
 *
 * Never throws — server actions can call this without try/catch.
 */
export async function sendPushToUsers(opts: {
  userIds: number[];
  excludeUserId?: number;
  payload: PushPayload;
}): Promise<void> {
  if (opts.userIds.length === 0) return;

  // Record the notification per recipient FIRST, regardless of whether
  // we can deliver push. The in-app feed at /dashboard/notifications is
  // the source of truth — push is best-effort delivery on top of that.
  const recipientIds = opts.userIds.filter((id) => id !== opts.excludeUserId);
  if (recipientIds.length > 0) {
    try {
      await prisma.notification.createMany({
        data: recipientIds.map((userId) => ({
          userId,
          title: opts.payload.title,
          body: opts.payload.body,
          url: opts.payload.url ?? null,
          kind: opts.payload.kind ?? null,
        })),
      });
      // Keep only the newest 50 per recipient. ponytail: 2 queries per
      // recipient, fine because a broadcast is a handful of team members.
      // Move to a periodic sweep if the team ever grows large.
      for (const userId of recipientIds) {
        const nth = await prisma.notification.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          skip: 50,
          take: 1,
          select: { createdAt: true },
        });
        if (nth[0]) {
          await prisma.notification.deleteMany({
            where: { userId, createdAt: { lt: nth[0].createdAt } },
          });
        }
      }
    } catch {
      /* feed write failure shouldn't block push delivery */
    }
  }

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    // Push not configured — silently skip so dev / preview don't crash.
    return;
  }
  try {
    ensureConfigured();
  } catch {
    return;
  }

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: recipientIds } },
  });
  if (subs.length === 0) return;

  const body = JSON.stringify(opts.payload);
  const stale: number[] = [];

  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          body,
          {
            TTL: 60,
            // "high" urgency tells FCM / APNS to deliver immediately and
            // wake the device — that's what makes the notification pop
            // down as a heads-up banner on Android instead of silently
            // landing in the tray. Combined with silent:false + vibrate
            // in the SW, the OS treats it as a full "alerting" event.
            urgency: "high",
          }
        );
      } catch (err: unknown) {
        const e = err as { statusCode?: number };
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          stale.push(s.id);
        }
        // Other errors are best-effort — log nothing in prod, keep the row.
      }
    })
  );

  if (stale.length > 0) {
    try {
      await prisma.pushSubscription.deleteMany({ where: { id: { in: stale } } });
    } catch {
      /* ignore */
    }
  }
}

/** Returns every active USER's id — convenience for "notify the team". */
export async function getAllUserIds(): Promise<number[]> {
  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/** Returns active MASTERs only — for approved-event notifications. */
export async function getMasterIds(): Promise<number[]> {
  const users = await prisma.user.findMany({
    where: { active: true, role: "MASTER" },
    select: { id: true },
  });
  return users.map((u) => u.id);
}
