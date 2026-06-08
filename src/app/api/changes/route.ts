import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { STATUS_LABEL } from "@/lib/leadStatus";

export const dynamic = "force-dynamic";

/**
 * Lightweight polling endpoint used by the Notifier client component.
 *
 *   GET /api/changes?since=2026-06-08T03:00:00.000Z
 *
 * Returns:
 *  - events:  human-readable strings ("Alex moved #14 to Contact · Able", etc.)
 *  - hasNew:  true if anything happened since `since` (so client can refresh)
 *  - now:     server timestamp to send as `since` on the next poll
 *
 * Auth: returns 401 if no session. Events authored by the *current* user are
 * filtered out — you don't need a notification for your own actions.
 */
type Event = {
  id: string;
  kind: "status" | "lead";
  text: string;
  at: string;
  leadId: number;
};

export async function GET(req: NextRequest) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sinceParam = req.nextUrl.searchParams.get("since");
  // Default to the last 60s of changes so the first poll after page load
  // doesn't silently miss anything that happened while React was hydrating.
  const since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 60_000);
  if (Number.isNaN(since.getTime())) {
    return NextResponse.json({ error: "bad_since" }, { status: 400 });
  }

  const [statusChanges, newLeads] = await Promise.all([
    prisma.leadStatusChange.findMany({
      where: { changedAt: { gt: since }, changedById: { not: me.id } },
      orderBy: { changedAt: "desc" },
      take: 20,
      select: {
        id: true,
        leadId: true,
        toStatus: true,
        changedAt: true,
        changedBy: { select: { displayName: true } },
      },
    }),
    prisma.lead.findMany({
      where: { createdAt: { gt: since }, createdById: { not: me.id } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        createdAt: true,
        createdBy: { select: { displayName: true } },
      },
    }),
  ]);

  const events: Event[] = [];

  for (const c of statusChanges) {
    events.push({
      id: `s${c.id}`,
      kind: "status",
      leadId: c.leadId,
      text: `${c.changedBy.displayName} moved lead #${c.leadId} to ${STATUS_LABEL[c.toStatus]}`,
      at: c.changedAt.toISOString(),
    });
  }
  for (const l of newLeads) {
    events.push({
      id: `l${l.id}`,
      kind: "lead",
      leadId: l.id,
      text: `${l.createdBy.displayName} added a new lead (#${l.id})`,
      at: l.createdAt.toISOString(),
    });
  }

  // Newest first.
  events.sort((a, b) => b.at.localeCompare(a.at));

  return NextResponse.json(
    {
      events,
      hasNew: events.length > 0,
      now: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } }
  );
}
