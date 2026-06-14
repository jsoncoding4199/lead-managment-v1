import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { STATUS_LABEL } from "@/lib/leadStatus";
import { visibleChannelsAll } from "@/lib/channels";

export const dynamic = "force-dynamic";

/**
 * Lightweight polling endpoint used by the Notifier client component.
 *
 *   GET /api/changes?since=2026-06-08T03:00:00.000Z
 *
 * Returns:
 *   events     — `kind: "lead" | "status" | "approved"` items since `since`
 *   hasNew     — true if anything happened (so the client can refresh)
 *   now        — server timestamp to send as `since` on the next poll
 *
 * Rules:
 *   - Events authored by the *current* user are filtered out — no
 *     self-notifications.
 *   - "approved" status changes (toStatus === APPROVED) are master-only.
 *     Non-master callers never see them because they can't view approved
 *     leads anyway.
 */
type Event = {
  id: string;
  kind: "status" | "lead" | "approved";
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

  const isMaster = me.role === "MASTER";

  // Channel filter — keep AHA / AHB events out of the polling feed for any
  // user who can't see those channels. Same set of channels used for both
  // queries so behavior is consistent across event kinds.
  const channelList = visibleChannelsAll({
    id: me.id,
    username: me.username,
    displayName: me.displayName,
    role: me.role,
  });

  const [statusChanges, newLeads] = await Promise.all([
    prisma.leadStatusChange.findMany({
      where: {
        changedAt: { gt: since },
        changedById: { not: me.id },
        // Non-master: never include APPROVED transitions (those leads are
        // master-only).
        ...(isMaster ? {} : { toStatus: { not: "APPROVED" } }),
        // Filter by the parent lead's channel — privates leak only to the
        // channel owner and master.
        lead: { channel: { in: channelList } },
      },
      orderBy: { changedAt: "desc" },
      take: 30,
      select: {
        id: true,
        leadId: true,
        toStatus: true,
        changedAt: true,
        changedBy: { select: { displayName: true } },
      },
    }),
    prisma.lead.findMany({
      where: {
        createdAt: { gt: since },
        createdById: { not: me.id },
        channel: { in: channelList },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        createdAt: true,
        createdBy: { select: { displayName: true } },
      },
    }),
  ]);

  const events: Event[] = [];

  for (const c of statusChanges) {
    if (c.toStatus === "APPROVED") {
      // Master-only celebratory event.
      events.push({
        id: `a${c.id}`,
        kind: "approved",
        leadId: c.leadId,
        text: `${c.changedBy.displayName} approved lead #${c.leadId} 🎉`,
        at: c.changedAt.toISOString(),
      });
    } else {
      events.push({
        id: `s${c.id}`,
        kind: "status",
        leadId: c.leadId,
        text: `${c.changedBy.displayName} moved lead #${c.leadId} to ${STATUS_LABEL[c.toStatus]}`,
        at: c.changedAt.toISOString(),
      });
    }
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
