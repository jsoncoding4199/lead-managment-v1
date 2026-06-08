import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { STATUS_LABEL } from "@/lib/leadStatus";
import { formatDateTime } from "@/lib/utils";
import { LeadCard } from "@/components/LeadCard";
import { LeadComments } from "@/components/LeadComments";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) notFound();

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, displayName: true } },
      assignedTo: { select: { id: true, displayName: true } },
      history: {
        orderBy: { changedAt: "desc" },
        include: { changedBy: { select: { displayName: true } } },
      },
      comments: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { id: true, displayName: true } } },
      },
    },
  });
  if (!lead) notFound();

  // Approved leads are master-only per spec.
  if (lead.status === "APPROVED" && user.role !== "MASTER") notFound();

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
          status: lead.status,
          createdAt: lead.createdAt.toISOString(),
          updatedAt: lead.updatedAt.toISOString(),
          createdBy: lead.createdBy,
          assignedTo: lead.assignedTo,
        }}
        viewerRole={user.role}
        teamUsers={teamUsers}
      />

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

      <LeadComments
        leadId={lead.id}
        viewerId={user.id}
        viewerRole={user.role}
        comments={lead.comments.map((c) => ({
          id: c.id,
          body: c.body,
          createdAt: c.createdAt.toISOString(),
          author: c.author,
        }))}
      />
    </div>
  );
}
