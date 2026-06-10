import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** POST /api/push/unsubscribe — Body: { endpoint }. Removes that one row. */
export async function POST(req: NextRequest) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const { endpoint } = (body as { endpoint?: string }) ?? {};
  if (!endpoint) return NextResponse.json({ error: "missing_endpoint" }, { status: 400 });

  await prisma.pushSubscription.deleteMany({
    where: { endpoint, userId: me.id },
  });

  return NextResponse.json({ ok: true });
}
