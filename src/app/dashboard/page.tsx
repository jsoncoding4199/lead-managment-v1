import Link from "next/link";
import type { LeadStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ARCHIVED_STATUSES, ARCHIVE_SECTIONS, OPEN_STATUSES } from "@/lib/leadStatus";
import { LeadComposer } from "@/components/LeadComposer";
import { LeadCard } from "@/components/LeadCard";
import { TabBar } from "@/components/TabBar";

type Search = { tab?: string; q?: string };

type LeadView = {
  id: number;
  content: string;
  status: LeadStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: number; displayName: string };
  assignedTo: { id: number; displayName: string } | null;
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab: "open" | "archive" = sp.tab === "archive" ? "archive" : "open";
  const q = (sp.q ?? "").trim();

  // Approved leads are master-only — keep them out of every list a regular user sees.
  const baseStatusFilter: LeadStatus[] =
    tab === "archive"
      ? user.role === "MASTER"
        ? ARCHIVED_STATUSES
        : ARCHIVED_STATUSES.filter((s) => s !== "APPROVED")
      : OPEN_STATUSES;

  const rawLeads = await prisma.lead.findMany({
    where: {
      status: { in: baseStatusFilter },
      ...(q
        ? { content: { contains: q, mode: "insensitive" as const } }
        : {}),
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 500,
    include: {
      createdBy: { select: { id: true, displayName: true } },
      assignedTo: { select: { id: true, displayName: true } },
    },
  });

  const leads: LeadView[] = rawLeads.map((l) => ({
    id: l.id,
    content: l.content,
    status: l.status,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    createdBy: l.createdBy,
    assignedTo: l.assignedTo,
  }));

  const masterArchiveFilter = user.role === "MASTER"
    ? { status: { in: ARCHIVED_STATUSES } }
    : { status: { in: ARCHIVED_STATUSES.filter((s) => s !== "APPROVED") } };

  const [openCount, archiveCount] = await Promise.all([
    prisma.lead.count({ where: { status: { in: OPEN_STATUSES } } }),
    prisma.lead.count({ where: masterArchiveFilter }),
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
            ? "Active pipeline — anyone on the team can drop new leads here, grouped by who added them."
            : "Closed leads, grouped by the reason they closed."}
        </p>
      </div>

      <TabBar tab={tab} openCount={openCount} archiveCount={archiveCount} q={q} />

      {tab === "open" && <LeadComposer />}

      {leads.length === 0 ? (
        <EmptyState tab={tab} hasQuery={!!q} />
      ) : tab === "open" ? (
        <OpenGrouped leads={leads} viewerRole={user.role} teamUsers={teamUsers} />
      ) : (
        <ArchiveGrouped leads={leads} viewerRole={user.role} teamUsers={teamUsers} />
      )}
    </div>
  );
}

/* ---------- Open: group by agent who added the lead ---------- */

function OpenGrouped({
  leads,
  viewerRole,
  teamUsers,
}: {
  leads: LeadView[];
  viewerRole: "MASTER" | "USER";
  teamUsers: { id: number; displayName: string }[];
}) {
  const groups = new Map<string, LeadView[]>();
  for (const lead of leads) {
    const key = lead.createdBy?.displayName ?? "Unknown";
    const arr = groups.get(key) ?? [];
    arr.push(lead);
    groups.set(key, arr);
  }
  // Sort group names alphabetically, but keep the viewer's own group on top.
  const entries = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-10">
      {entries.map(([agent, items]) => (
        <section key={agent} className="space-y-4">
          <header className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
              {initials(agent)}
            </div>
            <div>
              <h3 className="text-base font-semibold text-ink-900">{agent}</h3>
              <p className="text-xs text-ink-500">
                {items.length} lead{items.length === 1 ? "" : "s"} in pipeline
              </p>
            </div>
          </header>
          <ul className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            {items.map((lead) => (
              <li key={lead.id}>
                <LeadCard lead={lead} viewerRole={viewerRole} teamUsers={teamUsers} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ---------- Archive: group by terminal status ---------- */

function ArchiveGrouped({
  leads,
  viewerRole,
  teamUsers,
}: {
  leads: LeadView[];
  viewerRole: "MASTER" | "USER";
  teamUsers: { id: number; displayName: string }[];
}) {
  const byStatus = new Map<LeadStatus, LeadView[]>();
  for (const lead of leads) {
    const arr = byStatus.get(lead.status) ?? [];
    arr.push(lead);
    byStatus.set(lead.status, arr);
  }

  // Render sections in fixed display order from ARCHIVE_SECTIONS.
  const visibleSections = ARCHIVE_SECTIONS.filter((sec) => {
    if (sec.status === "APPROVED" && viewerRole !== "MASTER") return false;
    return (byStatus.get(sec.status)?.length ?? 0) > 0;
  });

  return (
    <div className="space-y-10">
      {visibleSections.map((sec) => {
        const items = byStatus.get(sec.status) ?? [];
        return (
          <section key={sec.status} className="space-y-4">
            <header className="flex items-center justify-between gap-3 border-b border-ink-200/70 pb-3">
              <div className="flex items-center gap-3">
                <span
                  className={
                    "h-2.5 w-2.5 rounded-full " +
                    (sec.tone === "good"
                      ? "bg-emerald-500"
                      : sec.tone === "bad"
                        ? "bg-rose-500"
                        : "bg-ink-400")
                  }
                />
                <h3 className="text-base font-semibold text-ink-900">{sec.label}</h3>
                <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold text-ink-600">
                  {items.length}
                </span>
              </div>
            </header>
            <ul className="grid gap-4 grid-cols-1 lg:grid-cols-2">
              {items.map((lead) => (
                <li key={lead.id}>
                  <LeadCard lead={lead} viewerRole={viewerRole} teamUsers={teamUsers} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function EmptyState({ tab, hasQuery }: { tab: "open" | "archive"; hasQuery: boolean }) {
  return (
    <div className="card p-12 text-center">
      <div className="mx-auto h-12 w-12 rounded-full bg-ink-100 grid place-items-center text-ink-400">
        ✦
      </div>
      <h3 className="mt-4 text-base font-semibold text-ink-900">
        {hasQuery
          ? "No leads match your search"
          : tab === "open"
            ? "No open leads yet"
            : "Archive is empty"}
      </h3>
      <p className="mt-1 text-sm text-ink-500">
        {hasQuery
          ? "Try a different search term."
          : tab === "open"
            ? "Paste a new lead above to start the pipeline."
            : "Closed and rejected leads will appear here."}
      </p>
      {tab === "archive" && !hasQuery && (
        <Link href="/dashboard" className="btn btn-outline mt-4 inline-flex">
          Go to Open
        </Link>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";
}
