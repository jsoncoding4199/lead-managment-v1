import { Suspense } from "react";
import Link from "next/link";
import type { LeadStatus, LeadQuality, Prisma } from "@prisma/client";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";
import { ACTIVE_STATUSES, ARCHIVED_STATUSES, ARCHIVE_SECTIONS, OPEN_STATUSES } from "@/lib/leadStatus";
import { LeadComposer } from "@/components/LeadComposer";
import { LeadCard } from "@/components/LeadCard";
import { TabBar } from "@/components/TabBar";
import { CollapsibleSection } from "@/components/CollapsibleSection";

/**
 * The page itself does the minimum work needed to render the chrome
 * (header, tabs, composer) and streams the leads + counts inside Suspense.
 *
 * VISIBILITY MODEL
 *   non-master users see leads where:
 *     - they are in the assignment list, OR
 *     - the lead has free slots (assignments.count < maxPickup) AND they are
 *       not already assigned (they could still pick it up).
 *   master sees all leads.
 *
 *   APPROVED leads are master-only in both Open and Archive.
 */

type Search = { tab?: string; q?: string };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab: "fresh" | "market" | "archive" =
    sp.tab === "market" ? "market" : sp.tab === "archive" ? "archive" : "fresh";
  const q = (sp.q ?? "").trim();

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h2 className="text-3xl font-semibold text-ink-900 tracking-tight">Leads</h2>
        <p className="text-ink-500 mt-1 text-sm">
          {tab === "fresh"
            ? user.role === "MASTER"
              ? "Fresh leads in the active pipeline."
              : "Your picked-up leads, plus leads still available to pick up."
            : tab === "market"
              ? user.role === "MASTER"
                ? "Leads that have moved out of New, grouped by status."
                : "Leads the team has moved out of New. Approved leads are master-only."
              : "Long-term archive — empty for now."}
        </p>
      </div>

      <Suspense fallback={<TabBarSkeleton />}>
        <TabBarWithCounts tab={tab} q={q} user={user} />
      </Suspense>

      {tab === "fresh" && <LeadComposer />}

      <Suspense fallback={<LeadsSkeleton />} key={`${tab}:${q}`}>
        <LeadsSection tab={tab} q={q} user={user} />
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
  quality: LeadQuality | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: number; displayName: string };
  assignees: { id: number; displayName: string }[];
};

/**
 * Build the WHERE clause for non-master users — the visibility rule.
 *
 * Open tab: NEW leads where I'm already on it, OR NEW leads with free
 *   slots (Prisma can't aggregate in WHERE; final cap check is at the
 *   application layer below).
 * Archive tab: only leads I am personally assigned to.
 *
 * Master sees everything in both tabs.
 */
function visibilityWhere(
  user: CurrentUser,
  tab: "fresh" | "market" | "archive"
): Prisma.LeadWhereInput {
  if (user.role === "MASTER") return {};
  if (tab === "market") {
    // Archive: visible to everyone. APPROVED already stripped by statusFilter.
    return {};
  }
  // Open tab — split by status:
  //   - NEW: visible if I'm on it OR there's a free slot (capacity check
  //          happens at the application layer below).
  //   - ABLE statuses: visible only if I'm assigned to it.
  return {
    OR: [
      { status: "NEW" },
      {
        AND: [
          { status: { in: ACTIVE_STATUSES } },
          { assignments: { some: { userId: user.id } } },
        ],
      },
    ],
  };
}

async function LeadsSection({
  tab,
  q,
  user,
}: {
  tab: "fresh" | "market" | "archive";
  q: string;
  user: CurrentUser;
}) {
  // The third tab is a placeholder for future use — render an empty state
  // without hitting the DB.
  if (tab === "archive") {
    return <EmptyState tab="archive" hasQuery={false} />;
  }

  const settings = await getAppSettings();

  // Base status filter by tab.
  let statusFilter: LeadStatus[];
  if (tab === "market") {
    // Open Market is visible to everyone. APPROVED is master-only — drop it
    // for non-master viewers.
    statusFilter =
      user.role === "MASTER"
        ? ARCHIVED_STATUSES
        : ARCHIVED_STATUSES.filter((s) => s !== "APPROVED");
  } else {
    statusFilter = OPEN_STATUSES;
  }

  const visibilityFilter = visibilityWhere(user, tab);

  const [rawLeads, teamUsers] = await Promise.all([
    prisma.lead.findMany({
      where: {
        AND: [
          { status: { in: statusFilter } },
          visibilityFilter,
          q ? { content: { contains: q, mode: "insensitive" as const } } : {},
        ],
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 200,
      select: {
        id: true,
        content: true,
        remark: true,
        status: true,
        quality: true,
        createdAt: true,
        updatedAt: true,
        createdBy: { select: { id: true, displayName: true } },
        assignments: {
          select: { user: { select: { id: true, displayName: true } } },
          orderBy: { assignedAt: "asc" },
        },
      },
    }),
    user.role === "MASTER"
      ? prisma.user.findMany({
          where: { active: true, role: "USER" },
          select: { id: true, displayName: true },
          orderBy: { displayName: "asc" },
        })
      : Promise.resolve([] as { id: number; displayName: string }[]),
  ]);

  // Post-filter for the slot-capacity rule (only relevant on Open tab for
  // non-master viewers; Prisma can't aggregate in WHERE).
  const visibleLeads = rawLeads.filter((l) => {
    if (user.role === "MASTER") return true;
    if (tab === "market") return true;
    const iAmAssigned = l.assignments.some((a) => a.user.id === user.id);
    if (iAmAssigned) return true;
    // For non-assigned, only NEW leads with free slots pass through.
    if (l.status !== "NEW") return false;
    return l.assignments.length < settings.maxPickup;
  });

  const leads: LeadView[] = visibleLeads.map((l) => ({
    id: l.id,
    content: l.content,
    remark: l.remark,
    status: l.status,
    quality: l.quality,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    createdBy: l.createdBy,
    assignees: l.assignments.map((a) => a.user),
  }));

  if (leads.length === 0) {
    return <EmptyState tab={tab} hasQuery={!!q} />;
  }

  return tab === "fresh" ? (
    <OpenGrouped leads={leads} viewer={user} teamUsers={teamUsers} maxPickup={settings.maxPickup} />
  ) : (
    <ArchiveGrouped leads={leads} viewer={user} teamUsers={teamUsers} maxPickup={settings.maxPickup} />
  );
}

/* ---------- Tab bar with counts (streamed) ---------- */

async function TabBarWithCounts({
  tab,
  q,
  user,
}: {
  tab: "fresh" | "market" | "archive";
  q: string;
  user: CurrentUser;
}) {
  // The third "Archive" tab is a placeholder for now — its count is always 0.
  if (user.role !== "MASTER") {
    const settings = await getAppSettings();
    const [freshRaw, marketCount] = await Promise.all([
      prisma.lead.findMany({
        where: { AND: [{ status: { in: OPEN_STATUSES } }, visibilityWhere(user, "fresh")] },
        select: { id: true, assignments: { select: { userId: true } } },
      }),
      prisma.lead.count({
        where: { status: { in: ARCHIVED_STATUSES.filter((s) => s !== "APPROVED") } },
      }),
    ]);
    const freshCount = freshRaw.filter((l) => {
      const mine = l.assignments.some((a) => a.userId === user.id);
      return mine || l.assignments.length < settings.maxPickup;
    }).length;
    return (
      <TabBar tab={tab} freshCount={freshCount} marketCount={marketCount} archiveCount={0} q={q} />
    );
  }

  const [freshCount, marketCount] = await Promise.all([
    prisma.lead.count({ where: { status: { in: OPEN_STATUSES } } }),
    prisma.lead.count({ where: { status: { in: ARCHIVED_STATUSES } } }),
  ]);
  return (
    <TabBar tab={tab} freshCount={freshCount} marketCount={marketCount} archiveCount={0} q={q} />
  );
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

/**
 * Open tab grouping rules:
 *  - Non-master: two buckets — "My picked-up" and "Available to pick up"
 *  - Master: grouped by each assignee user. A lead with multiple assignees
 *    appears under each of them; unassigned ones go in their own bucket.
 */
function OpenGrouped({
  leads,
  viewer,
  teamUsers,
  maxPickup,
}: {
  leads: LeadView[];
  viewer: CurrentUser;
  teamUsers: { id: number; displayName: string }[];
  maxPickup: number;
}) {
  if (viewer.role !== "MASTER") {
    const mine = leads.filter((l) => l.assignees.some((a) => a.id === viewer.id));
    const available = leads.filter((l) => !l.assignees.some((a) => a.id === viewer.id));
    return (
      <div className="space-y-6">
        {mine.length > 0 && (
          <CollapsibleSection
            storageKey="open:mine"
            count={mine.length}
            header={
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                  ME
                </div>
                <div>
                  <h3 className="text-base font-semibold text-ink-900">My picked-up leads</h3>
                  <p className="text-xs text-ink-500">{mine.length} active</p>
                </div>
              </div>
            }
          >
            <ul className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {mine.map((lead) => (
                <li key={lead.id}>
                  <LeadCard lead={lead} viewer={viewer} teamUsers={teamUsers} maxPickup={maxPickup} />
                </li>
              ))}
            </ul>
          </CollapsibleSection>
        )}
        {available.length > 0 && (
          <CollapsibleSection
            storageKey="open:available"
            count={available.length}
            header={
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700">
                  ⬆
                </div>
                <div>
                  <h3 className="text-base font-semibold text-ink-900">Available to pick up</h3>
                  <p className="text-xs text-ink-500">{available.length} open · up to {maxPickup} pickers per lead</p>
                </div>
              </div>
            }
          >
            <ul className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {available.map((lead) => (
                <li key={lead.id}>
                  <LeadCard lead={lead} viewer={viewer} teamUsers={teamUsers} maxPickup={maxPickup} />
                </li>
              ))}
            </ul>
          </CollapsibleSection>
        )}
      </div>
    );
  }

  // Master view: group by each assignee. Leads with no assignees go in "Unassigned".
  const buckets = new Map<string, { label: string; items: LeadView[] }>();
  const unassigned: LeadView[] = [];
  for (const lead of leads) {
    if (lead.assignees.length === 0) {
      unassigned.push(lead);
      continue;
    }
    for (const a of lead.assignees) {
      const key = `user:${a.id}`;
      const bucket = buckets.get(key) ?? { label: a.displayName, items: [] };
      bucket.items.push(lead);
      buckets.set(key, bucket);
    }
  }

  const entries = Array.from(buckets.entries()).sort((a, b) => a[1].label.localeCompare(b[1].label));

  return (
    <div className="space-y-6">
      {unassigned.length > 0 && (
        <CollapsibleSection
          storageKey="open:unassigned"
          count={unassigned.length}
          header={
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-amber-100 text-sm font-semibold text-amber-700">
                ?
              </div>
              <div>
                <h3 className="text-base font-semibold text-ink-900">Unassigned</h3>
                <p className="text-xs text-ink-500">Not picked up by anyone yet.</p>
              </div>
            </div>
          }
        >
          <ul className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {unassigned.map((lead) => (
              <li key={lead.id}>
                <LeadCard lead={lead} viewer={viewer} teamUsers={teamUsers} maxPickup={maxPickup} />
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}
      {entries.map(([key, bucket]) => (
        <CollapsibleSection
          key={key}
          storageKey={`open:${key}`}
          count={bucket.items.length}
          header={
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                {initials(bucket.label)}
              </div>
              <div>
                <h3 className="text-base font-semibold text-ink-900">{bucket.label}</h3>
                <p className="text-xs text-ink-500">
                  {bucket.items.length} lead{bucket.items.length === 1 ? "" : "s"} picked up
                </p>
              </div>
            </div>
          }
        >
          <ul className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {bucket.items.map((lead) => (
              <li key={lead.id}>
                <LeadCard lead={lead} viewer={viewer} teamUsers={teamUsers} maxPickup={maxPickup} />
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
  viewer,
  teamUsers,
  maxPickup,
}: {
  leads: LeadView[];
  viewer: CurrentUser;
  teamUsers: { id: number; displayName: string }[];
  maxPickup: number;
}) {
  const byStatus = new Map<LeadStatus, LeadView[]>();
  for (const lead of leads) {
    const arr = byStatus.get(lead.status) ?? [];
    arr.push(lead);
    byStatus.set(lead.status, arr);
  }

  const visibleSections = ARCHIVE_SECTIONS.filter((sec) => {
    if (sec.status === "APPROVED" && viewer.role !== "MASTER") return false;
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
                  <LeadCard lead={lead} viewer={viewer} teamUsers={teamUsers} maxPickup={maxPickup} />
                </li>
              ))}
            </ul>
          </CollapsibleSection>
        );
      })}
    </div>
  );
}

function EmptyState({ tab, hasQuery }: { tab: "fresh" | "market" | "archive"; hasQuery: boolean }) {
  const title = hasQuery
    ? "No leads match your search"
    : tab === "fresh"
      ? "No leads to show"
      : tab === "market"
        ? "Open Market is empty"
        : "Archive is empty";
  const body = hasQuery
    ? "Try a different search term."
    : tab === "fresh"
      ? "Paste a new lead above, or wait for a teammate to drop one in."
      : tab === "market"
        ? "Closed leads will appear here once the team starts moving them out of New."
        : "Nothing has been moved to the long-term archive yet.";
  return (
    <div className="card p-12 text-center">
      <div className="mx-auto h-12 w-12 rounded-full bg-ink-100 grid place-items-center text-ink-400">
        ✦
      </div>
      <h3 className="mt-4 text-base font-semibold text-ink-900">{title}</h3>
      <p className="mt-1 text-sm text-ink-500">{body}</p>
      {tab !== "fresh" && !hasQuery && (
        <Link href="/dashboard" className="btn btn-outline mt-4 inline-flex">
          Go to Fresh
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
