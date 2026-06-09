import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";
import { STATUS_LABEL } from "@/lib/leadStatus";
import { formatDateTime } from "@/lib/utils";
import { LeadCard } from "@/components/LeadCard";
import { LeadContentEditor } from "@/components/LeadContentEditor";
import { LeadRemarkEditor } from "@/components/LeadRemarkEditor";
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
      },
    }),
    getAppSettings(),
  ]);
  if (!lead) notFound();

  // APPROVED is master-only.
  if (lead.status === "APPROVED" && user.role !== "MASTER") notFound();

  // Non-master visibility:
  //   - If they are assigned, they can always view.
  //   - Otherwise, only NEW leads with a free pickup slot are viewable
  //     (so users can land on the detail page to pick it up).
  //   - All archived statuses are off-limits to anyone who isn't on them.
  if (user.role !== "MASTER") {
    const iAmAssigned = lead.assignments.some((a) => a.user.id === user.id);
    if (!iAmAssigned) {
      if (lead.status !== "NEW") notFound();
      if (lead.assignments.length >= settings.maxPickup) notFound();
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

      <LeadRemarkEditor leadId={lead.id} initial={lead.remark} />

      <section className="card p-6">
        <h3 className="text-sm font-semibold text-ink-900">Status history</h3>
        <p className="text-xs text-ink-500 mt-0.5">
          Every status change is recorded here for visibility.
        </p>

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
