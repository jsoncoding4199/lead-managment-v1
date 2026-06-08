import { Suspense } from "react";
import Link from "next/link";
import type { LeadStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ARCHIVED_STATUSES, ARCHIVE_SECTIONS, OPEN_STATUSES } from "@/lib/leadStatus";
import { LeadComposer } from "@/components/LeadComposer";
import { LeadCard } from "@/components/LeadCard";
import { TabBar } from "@/components/TabBar";
import { CollapsibleSection } from "@/components/CollapsibleSection";

/**
 * The page itself does the minimum work needed to render the chrome
 * (header, tabs, composer) and streams the leads + counts inside a
 * Suspense boundary so the shell appears instantly while the DB query
 * is still in flight.
 */

type Search = { tab?: string; q?: string };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  // Only the gate runs here — fast, cached via React's cache() in auth.ts.
  const user = await requireUser();
  const sp = await searchParams;
  const tab: "open" | "archive" = sp.tab === "archive" ? "archive" : "open";
  const q = (sp.q ?? "").trim();

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

      <Suspense fallback={<TabBarSkeleton />}>
        <TabBarWithCounts tab={tab} q={q} viewerRole={user.role} />
      </Suspense>

      {tab === "open" && <LeadComposer />}

      <Suspense fallback={<LeadsSkeleton />} key={`${tab}:${q}`}>
        <LeadsSection tab={tab} q={q} viewerRole={user.role} />
      </Suspense>
    </div>
  );
}

/* ---------- Lead data section ---------- */

type LeadView = {
  id: number;
  content: string;
  remark: string | null;
  status: LeadStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: number; displayName: string };
  assignedTo: { id: number; displayName: string } | null;
};

async function LeadsSection({
  tab,
  q,
  viewerRole,
}: {
  tab: "open" | "archive";
  q: string;
  viewerRole: "MASTER" | "USER";
}) {
  // Approved leads are master-only — drop them out of the filter for regular users.
  const statusFilter: LeadStatus[] =
    tab === "archive"
      ? viewerRole === "MASTER"
        ? ARCHIVED_STATUSES
        : ARCHIVED_STATUSES.filter((s) => s !== "APPROVED")
      : OPEN_STATUSES;

  // Run leads + team users in parallel. teamUsers is only needed by MASTER for
  // the inline assignment dropdown; skip the query otherwise.
  const [rawLeads, teamUsers] = await Promise.all([
    prisma.lead.findMany({
      where: {
        status: { in: statusFilter },
        ...(q
          ? { content: { contains: q, mode: "insensitive" as const } }
          : {}),
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 100,
      select: {
        id: true,
        content: true,
        remark: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        createdBy: { select: { id: true, displayName: true } },
        assignedTo: { select: { id: true, displayName: true } },
      },
    }),
    viewerRole === "MASTER"
      ? prisma.user.findMany({
          where: { active: true, role: "USER" },
          select: { id: true, displayName: true },
          orderBy: { displayName: "asc" },
        })
      : Promise.resolve([] as { id: number; displayName: string }[]),
  ]);

  const leads: LeadView[] = rawLeads.map((l) => ({
    id: l.id,
    content: l.content,
    remark: l.remark,
    status: l.status,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    createdBy: l.createdBy,
    assignedTo: l.assignedTo,
  }));

  if (leads.length === 0) {
    return <EmptyState tab={tab} hasQuery={!!q} />;
  }

  return tab === "open" ? (
    <OpenGrouped leads={leads} viewerRole={viewerRole} teamUsers={teamUsers} />
  ) : (
    <ArchiveGrouped leads={leads} viewerRole={viewerRole} teamUsers={teamUsers} />
  );
}

/* ---------- Tab bar with counts (streamed) ---------- */

async function TabBarWithCounts({
  tab,
  q,
  viewerRole,
}: {
  tab: "open" | "archive";
  q: string;
  viewerRole: "MASTER" | "USER";
}) {
  const archiveStatuses =
    viewerRole === "MASTER"
      ? ARCHIVED_STATUSES
      : ARCHIVED_STATUSES.filter((s) => s !== "APPROVED");

  // Both counts run in parallel.
  const [openCount, archiveCount] = await Promise.all([
    prisma.lead.count({ where: { status: { in: OPEN_STATUSES } } }),
    prisma.lead.count({ where: { status: { in: archiveStatuses } } }),
  ]);

  return <TabBar tab={tab} openCount={openCount} archiveCount={archiveCount} q={q} />;
}

/* ---------- Skeletons ---------- */

function TabBarSkeleton() {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="inline-flex h-12 w-64 rounded-xl bg-white ring-1 ring-ink-200 shadow-soft animate-pulse" />
      <div className="h-12 w-72 rounded-lg bg-white ring-1 ring-ink-200 animate-pulse" />
    </div>
  );
}

function LeadsSkeleton() {
  return (
    <div className="space-y-10">
      {[0, 1].map((g) => (
        <section key={g} className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-ink-100 animate-pulse" />
            <div className="space-y-2">
              <div className="h-4 w-32 rounded bg-ink-100 animate-pulse" />
              <div className="h-3 w-20 rounded bg-ink-100 animate-pulse" />
            </div>
          </div>
          <ul className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {[0, 1].map((i) => (
              <li key={i} className="card p-5 space-y-3">
                <div className="flex justify-between">
                  <div className="h-5 w-24 rounded-full bg-ink-100 animate-pulse" />
                  <div className="h-7 w-28 rounded-md bg-ink-100 animate-pulse" />
                </div>
                <div className="h-24 rounded-lg bg-ink-50 animate-pulse" />
                <div className="flex gap-3">
                  <div className="h-3 w-20 rounded bg-ink-100 animate-pulse" />
                  <div className="h-3 w-20 rounded bg-ink-100 animate-pulse" />
                  <div className="h-3 w-16 rounded bg-ink-100 animate-pulse" />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ---------- Grouped renderers ---------- */

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
  const entries = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      {entries.map(([agent, items]) => (
        <CollapsibleSection
          key={agent}
          storageKey={`open:${agent}`}
          count={items.length}
          header={
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                {initials(agent)}
              </div>
              <div>
                <h3 className="text-base font-semibold text-ink-900">{agent}</h3>
                <p className="text-xs text-ink-500">
                  {items.length} lead{items.length === 1 ? "" : "s"} in pipeline
                </p>
              </div>
            </div>
          }
        >
          <ul className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {items.map((lead) => (
              <li key={lead.id}>
                <LeadCard lead={lead} viewerRole={viewerRole} teamUsers={teamUsers} />
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ))}
    </div>
  );
}

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

  const visibleSections = ARCHIVE_SECTIONS.filter((sec) => {
    if (sec.status === "APPROVED" && viewerRole !== "MASTER") return false;
    return (byStatus.get(sec.status)?.length ?? 0) > 0;
  });

  return (
    <div className="space-y-6">
      {visibleSections.map((sec) => {
        const items = byStatus.get(sec.status) ?? [];
        return (
          <CollapsibleSection
            key={sec.status}
            storageKey={`archive:${sec.status}`}
            defaultOpen={sec.status !== "APPROVED"}
            count={items.length}
            header={
              <div className="flex items-center gap-3 border-b border-ink-200/70 pb-2">
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
              </div>
            }
          >
            <ul className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {items.map((lead) => (
                <li key={lead.id}>
                  <LeadCard lead={lead} viewerRole={viewerRole} teamUsers={teamUsers} />
                </li>
              ))}
            </ul>
          </CollapsibleSection>
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
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}
