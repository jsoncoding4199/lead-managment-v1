import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Hand } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";
import {
  STATUS_LABEL,
  ACTIVE_STATUSES,
  ALWAYS_ARCHIVED_STATUSES,
} from "@/lib/leadStatus";
import { canAccessLead } from "@/lib/channels";
import { formatDateTime } from "@/lib/utils";
import { LeadCard } from "@/components/LeadCard";
import { LeadContentEditor } from "@/components/LeadContentEditor";
import { LeadRemarkThread } from "@/components/LeadRemarkThread";
import { DeleteLeadCard } from "@/components/DeleteLeadCard";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) notFound();

  const [lead, settings] = await Promise.all([
    prisma.lead.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, displayName: true } },
        assignments: {
          select: { user: { select: { id: true, displayName: true } } },
          orderBy: { assignedAt: "asc" },
        },
        history: {
          orderBy: { changedAt: "desc" },
          include: { changedBy: { select: { displayName: true } } },
        },
        remarks: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, displayName: true } } },
        },
      },
    }),
    getAppSettings(),
  ]);
  if (!lead) notFound();

  // Channel guard — block direct URL access to private-channel leads for
  // anyone who isn't the channel owner or master. Indistinguishable from a
  // real 404 so the ID can't be probed to detect existence.
  if (!canAccessLead(user, lead.privateChannelUserId)) notFound();

  // Non-master visibility per status:
  //   - ALWAYS_ARCHIVED (APPROVED / REJECTED): master-only, hard 404.
  //     The Archive tab itself is hidden from non-master users now.
  //   - ABLE (Contact/Documents/Appointment): only assignees can view.
  //   - NEW: assignees, plus anyone if there's still a pickup slot.
  //   - Soft-negative (NOT_ABLE / SPAM): visible to everyone — they stay
  //     in Open Market for the team to keep retrying. No archive lockout.
  if (user.role !== "MASTER") {
    if (ALWAYS_ARCHIVED_STATUSES.includes(lead.status)) notFound();
    const iAmAssigned = lead.assignments.some((a) => a.user.id === user.id);
    if (ACTIVE_STATUSES.includes(lead.status) && !iAmAssigned) notFound();
    if (lead.status === "NEW" && !iAmAssigned && lead.assignments.length >= settings.maxPickup) {
      notFound();
    }
  }

  const teamUsers =
    user.role === "MASTER"
      ? await prisma.user.findMany({
          where: { active: true, role: "USER" },
          select: { id: true, displayName: true },
          orderBy: { displayName: "asc" },
        })
      : [];

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-700">
        <ArrowLeft className="h-4 w-4" />
        Back to leads
      </Link>

      <LeadCard
        lead={{
          id: lead.id,
          content: lead.content,
          remark: lead.remark,
          status: lead.status,
          quality: lead.quality,
          createdAt: lead.createdAt.toISOString(),
          updatedAt: lead.updatedAt.toISOString(),
          createdBy: lead.createdBy,
          assignees: lead.assignments.map((a) => a.user),
        }}
        viewer={{ id: user.id, role: user.role }}
        teamUsers={teamUsers}
        maxPickup={settings.maxPickup}
      />

      <LeadContentEditor leadId={lead.id} initial={lead.content} />

      <LeadRemarkThread
        leadId={lead.id}
        viewerId={user.id}
        remarks={lead.remarks.map((r) => ({
          id: r.id,
          body: r.body,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
          author: r.author,
        }))}
      />

      <section className="card p-6">
        <h3 className="text-sm font-semibold text-ink-900">Status history</h3>
        <p className="text-xs text-ink-500 mt-0.5">
          Every status change is recorded here for visibility.
        </p>

        {/*
          Lifetime pickup counter on the lead itself. Never decrements when
          the lead's status moves on, so it reflects "how many times this
          lead has been worked on" — independent of who.
        */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700 ring-1 ring-brand-200"
            title="Total self-pickups for this lead (cumulative)"
          >
            <Hand className="h-3 w-3" />
            Picked up {lead.pickUpsCount}{" "}
            {lead.pickUpsCount === 1 ? "time" : "times"}
          </span>
        </div>

        {lead.history.length === 0 ? (
          <div className="mt-4 text-sm text-ink-500">No status changes yet.</div>
        ) : (
          <ol className="mt-5 space-y-4 border-l border-ink-200 pl-5">
            {lead.history.map((h) => (
              <li key={h.id} className="relative">
                <span className="absolute -left-[26px] top-1.5 h-3 w-3 rounded-full bg-brand-500 ring-4 ring-brand-50" />
                <div className="text-sm text-ink-800">
                  <span className="text-ink-500">{h.fromStatus ? STATUS_LABEL[h.fromStatus] : "Created"}</span>
                  <span className="mx-2 text-ink-400">→</span>
                  <span className="font-medium">{STATUS_LABEL[h.toStatus]}</span>
                </div>
                <div className="text-xs text-ink-500 mt-0.5">
                  {h.changedBy.displayName} · {formatDateTime(h.changedAt)}
                </div>
                {h.note && (
                  <div className="mt-1 rounded-md bg-ink-50 px-3 py-2 text-sm text-ink-700">{h.note}</div>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <DeleteLeadCard leadId={lead.id} />
    </div>
  );
}
