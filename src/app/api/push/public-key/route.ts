import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Returns the VAPID public key so the client can subscribe.
 * Public info — no auth required, no secret risk.
 */
export async function GET() {
  const key = process.env.VAPID_PUBLIC_KEY ?? "";
  return NextResponse.json({ key });
}
