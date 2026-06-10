import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/push/subscribe
 *
 * Body: { endpoint, keys: { p256dh, auth } }
 *
 * Idempotent — re-subscribing with the same endpoint updates the keys and
 * userId rather than creating a duplicate.
 */
export async function POST(req: NextRequest) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const sub = body as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const ua = req.headers.get("user-agent")?.slice(0, 255) ?? null;

  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    update: {
      userId: me.id,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: ua,
    },
    create: {
      userId: me.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: ua,
    },
  });

  return NextResponse.json({ ok: true });
}
