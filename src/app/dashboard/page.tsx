import Link from "next/link";
import type { LeadStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ARCHIVED_STATUSES, OPEN_STATUSES } from "@/lib/leadStatus";
import { LeadComposer } from "@/components/LeadComposer";
import { LeadCard } from "@/components/LeadCard";
import { TabBar } from "@/components/TabBar";

type Search = { tab?: string; q?: string };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab: "open" | "archive" = sp.tab === "archive" ? "archive" : "open";
  const q = (sp.q ?? "").trim();

  const statusFilter: LeadStatus[] = tab === "archive" ? ARCHIVED_STATUSES : OPEN_STATUSES;

  const leads = await prisma.lead.findMany({
    where: {
      status: { in: statusFilter },
      ...(q
        ? { content: { contains: q, mode: "insensitive" as const } }
        : {}),
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 200,
    include: {
      createdBy: { select: { id: true, displayName: true } },
      assignedTo: { select: { id: true, displayName: true } },
    },
  });

  const [openCount, archiveCount] = await Promise.all([
    prisma.lead.count({ where: { status: { in: OPEN_STATUSES } } }),
    prisma.lead.count({ where: { status: { in: ARCHIVED_STATUSES } } }),
  ]);

  const teamUsers =
    user.role === "MASTER"
      ? await prisma.user.findMany({
          where: { active: true, role: "USER" },
          select: { id: true, displayName: true },
          orderBy: { displayName: "asc" },
        })
      : [];

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h2 className="text-3xl font-semibold text-ink-900 tracking-tight">Leads</h2>
        <p className="text-ink-500 mt-1 text-sm">
          {tab === "open"
            ? "Active pipeline — anyone on the team can drop new leads here."
            : "Closed leads. Re-open is a master action."}
        </p>
      </div>

      <TabBar tab={tab} openCount={openCount} archiveCount={archiveCount} q={q} />

      {tab === "open" && <LeadComposer />}

      {leads.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <ul className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {leads.map((lead) => (
            <li key={lead.id}>
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({ tab }: { tab: "open" | "archive" }) {
  return (
    <div className="card p-12 text-center">
      <div className="mx-auto h-12 w-12 rounded-full bg-ink-100 grid place-items-center text-ink-400">
        ✦
      </div>
      <h3 className="mt-4 text-base font-semibold text-ink-900">
        {tab === "open" ? "No open leads yet" : "Archive is empty"}
      </h3>
      <p className="mt-1 text-sm text-ink-500">
        {tab === "open"
          ? "Paste a new lead above to start the pipeline."
          : "Closed and rejected leads will appear here."}
      </p>
      {tab === "archive" && (
        <Link href="/dashboard" className="btn btn-outline mt-4 inline-flex">
          Go to Open
        </Link>
      )}
    </div>
  );
}
