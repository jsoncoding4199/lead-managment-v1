import { Suspense } from "react";
import Link from "next/link";
import type { LeadStatus, LeadQuality, Prisma } from "@prisma/client";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";
import {
  ACTIVE_STATUSES,
  ARCHIVABLE_NOT_ABLE_STATUSES,
  AGE_BOUNDARY_DAYS,
} from "@/lib/leadStatus";
import {
  CHANNEL_LABEL,
  canSeeChannel,
  type ChannelKey,
} from "@/lib/channels";
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

type DashTab = "fresh" | "market" | "picks" | "archive" | "aha" | "ahb";

type Search = { tab?: string; q?: string };

function parseTab(raw: string | undefined): DashTab {
  switch (raw) {
    case "market":
    case "picks":
    case "archive":
    case "aha":
    case "ahb":
      return raw;
    default:
      return "fresh";
  }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab: DashTab = parseTab(sp.tab);
  const q = (sp.q ?? "").trim();

  const channelKey: ChannelKey | null =
    tab === "aha" ? "AHA" : tab === "ahb" ? "AHB" : null;

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
              : tab === "picks"
                ? user.role === "MASTER"
                  ? "Every lead picked up by the team, grouped by who has it."
                  : "Leads you've personally picked up."
                : tab === "archive"
                  ? "Closed and approved leads — master only."
                  : `Private ${CHANNEL_LABEL[channelKey!]} channel — visible only to the channel owner and master.`}
        </p>
      </div>

      <Suspense fallback={<TabBarSkeleton />}>
        <TabBarWithCounts tab={tab} q={q} user={user} />
      </Suspense>

      {/*
        Composer rules:
          - Fresh:   any user can add a default-channel lead.
          - AHA/AHB: only master can drop leads in (and only if the tab is
                    visible to them, which it always is for master).
      */}
      {tab === "fresh" && <LeadComposer />}
      {channelKey && user.role === "MASTER" && (
        <LeadComposer channel={channelKey} />
      )}

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
 * Visibility within Fresh + Open Market for non-master users.
 *   - NEW + NOT_ABLE/SPAM/REJECTED visible to everyone (they can be picked up).
 *   - ABLE statuses visible only to the assignees.
 *   - APPROVED never (it's master-only and not in these tabs anyway).
 * Archive itself is master-only — non-master access is blocked one level up
 * in LeadsSection / TabBarWithCounts.
 */
function freshOrMarketVisibility(user: CurrentUser): Prisma.LeadWhereInput {
  if (user.role === "MASTER") return {};
  return {
    AND: [
      { status: { not: "APPROVED" } },
      {
        OR: [
          { status: { notIn: ACTIVE_STATUSES } },
          {
            AND: [
              { status: { in: ACTIVE_STATUSES } },
              { assignments: { some: { userId: user.id } } },
            ],
          },
        ],
      },
    ],
  };
}

/** Returns the cutoff date — leads created before this go into Open Market. */
function ageBoundaryDate(): Date {
  return new Date(Date.now() - AGE_BOUNDARY_DAYS * 86_400_000);
}

/** "Archive-bound" — would currently appear in the Archive tab (master only). */
function isArchiveBound(
  lead: { status: LeadStatus; assignments: { userId: number }[] | { user: { id: number } }[] },
  maxPickup: number
): boolean {
  if (lead.status === "APPROVED") return true;
  if (!ARCHIVABLE_NOT_ABLE_STATUSES.includes(lead.status)) return false;
  return lead.assignments.length >= maxPickup;
}

async function LeadsSection({
  tab,
  q,
  user,
}: {
  tab: DashTab;
  q: string;
  user: CurrentUser;
}) {
  const settings = await getAppSettings();
  const cutoff = ageBoundaryDate();

  /* ---------- Private channel tabs ---------- */
  if (tab === "aha" || tab === "ahb") {
    const channelKey: ChannelKey = tab === "aha" ? "AHA" : "AHB";
    if (!canSeeChannel(user, channelKey)) {
      return <ChannelLockedNotice channel={channelKey} />;
    }
    const channelLeads = await prisma.lead.findMany({
      where: {
        AND: [
          { channel: channelKey },
          q ? { content: { contains: q, mode: "insensitive" as const } } : {},
        ],
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 200,
      select: leadSelect,
    });
    if (channelLeads.length === 0) {
      return <ChannelEmpty channel={channelKey} hasQuery={!!q} />;
    }
    const leads = channelLeads.map(toLeadView);
    return (
      <ChannelLeadList
        channel={channelKey}
        leads={leads}
        viewer={user}
        maxPickup={settings.maxPickup}
      />
    );
  }

  /* ---------- My Pick Up tab ---------- */
  if (tab === "picks") {
    // Non-master: only leads where I'm an assignee (excluding APPROVED, which
    // is master-only anyway). Master: every lead that has at least one
    // assignee — grouped by user on the render side.
    const baseWhere: Prisma.LeadWhereInput =
      user.role === "MASTER"
        ? { assignments: { some: {} } }
        : {
            AND: [
              { assignments: { some: { userId: user.id } } },
              { status: { not: "APPROVED" } },
            ],
          };

    const [picked, teamUsers] = await Promise.all([
      prisma.lead.findMany({
        where: {
          AND: [
            { channel: "DEFAULT" },
            baseWhere,
            q ? { content: { contains: q, mode: "insensitive" as const } } : {},
          ],
        },
        orderBy: [{ updatedAt: "desc" }],
        take: 200,
        select: leadSelect,
      }),
      user.role === "MASTER"
        ? prisma.user.findMany({
            where: { active: true, role: "USER" },
            select: { id: true, displayName: true },
            orderBy: { displayName: "asc" },
          })
        : Promise.resolve([] as { id: number; displayName: string }[]),
    ]);

    if (picked.length === 0) {
      return <EmptyState tab="picks" hasQuery={!!q} />;
    }
    const leads = picked.map(toLeadView);
    return user.role === "MASTER" ? (
      <PicksByAssignee
        leads={leads}
        viewer={user}
        teamUsers={teamUsers}
        maxPickup={settings.maxPickup}
      />
    ) : (
      <MyPicksByStatus
        leads={leads}
        viewer={user}
        teamUsers={teamUsers}
        maxPickup={settings.maxPickup}
      />
    );
  }

  /* ---------- Archive tab — master only ---------- */
  if (tab === "archive") {
    if (user.role !== "MASTER") {
      return <ArchiveLockedNotice />;
    }

    const [archivable, teamUsers] = await Promise.all([
      prisma.lead.findMany({
        where: {
          AND: [
            { channel: "DEFAULT" },
            {
              OR: [
                { status: "APPROVED" },
                { status: { in: ARCHIVABLE_NOT_ABLE_STATUSES } },
              ],
            },
            q ? { content: { contains: q, mode: "insensitive" as const } } : {},
          ],
        },
        orderBy: [{ updatedAt: "desc" }],
        take: 200,
        select: leadSelect,
      }),
      prisma.user.findMany({
        where: { active: true, role: "USER" },
        select: { id: true, displayName: true },
        orderBy: { displayName: "asc" },
      }),
    ]);

    // Keep only leads that genuinely live in Archive right now.
    const filtered = archivable.filter((l) => isArchiveBound(l, settings.maxPickup));
    if (filtered.length === 0) {
      return <EmptyState tab="archive" hasQuery={!!q} />;
    }
    const leads = filtered.map(toLeadView);
    return (
      <ArchiveByAssignee
        leads={leads}
        viewer={user}
        teamUsers={teamUsers}
        maxPickup={settings.maxPickup}
      />
    );
  }

  /* ---------- Fresh + Open Market tabs ---------- */

  // Date-based bucketing: Fresh = createdAt > cutoff, Open Market = createdAt <= cutoff.
  const dateFilter: Prisma.LeadWhereInput = tab === "fresh"
    ? { createdAt: { gt: cutoff } }
    : { createdAt: { lte: cutoff } };

  const visibilityFilter = freshOrMarketVisibility(user);

  const [rawLeads, teamUsers] = await Promise.all([
    prisma.lead.findMany({
      where: {
        AND: [
          { channel: "DEFAULT" },
          dateFilter,
          visibilityFilter,
          q ? { content: { contains: q, mode: "insensitive" as const } } : {},
        ],
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 200,
      select: leadSelect,
    }),
    user.role === "MASTER"
      ? prisma.user.findMany({
          where: { active: true, role: "USER" },
          select: { id: true, displayName: true },
          orderBy: { displayName: "asc" },
        })
      : Promise.resolve([] as { id: number; displayName: string }[]),
  ]);

  // Post-filter:
  //   - Drop leads that should be in Archive (NOT_ABLE/SPAM/REJECT/APPROVED + max picked).
  //   - For non-master: enforce pickup-cap rule on NEW leads (capacity rule).
  const visibleLeads = rawLeads.filter((l) => {
    if (isArchiveBound(l, settings.maxPickup)) return false;
    if (user.role === "MASTER") return true;
    const iAmAssigned = l.assignments.some((a) => a.user.id === user.id);
    if (iAmAssigned) return true;
    if (l.status === "NEW") {
      return l.assignments.length < settings.maxPickup;
    }
    // NOT_ABLE / SPAM / REJECTED leads still visible to everyone in F/OM.
    if (ARCHIVABLE_NOT_ABLE_STATUSES.includes(l.status)) return true;
    // ABLE leads were already filtered out by visibility WHERE for non-assigned.
    return false;
  });

  if (visibleLeads.length === 0) {
    return <EmptyState tab={tab} hasQuery={!!q} />;
  }

  const leads = visibleLeads.map(toLeadView);
  return (
    <OpenGrouped
      leads={leads}
      viewer={user}
      teamUsers={teamUsers}
      maxPickup={settings.maxPickup}
    />
  );
}

/* ---------- Shared Prisma select + projection ---------- */

const leadSelect = {
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
} satisfies Prisma.LeadSelect;

type RawLead = {
  id: number;
  content: string;
  remark: string | null;
  status: LeadStatus;
  quality: LeadQuality | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { id: number; displayName: string };
  assignments: { user: { id: number; displayName: string } }[];
};

function toLeadView(l: RawLead): LeadView {
  return {
    id: l.id,
    content: l.content,
    remark: l.remark,
    status: l.status,
    quality: l.quality,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    createdBy: l.createdBy,
    assignees: l.assignments.map((a) => a.user),
  };
}

function ChannelLockedNotice({ channel }: { channel: ChannelKey }) {
  return (
    <div className="card p-12 text-center">
      <div className="mx-auto h-12 w-12 rounded-full bg-ink-100 grid place-items-center text-ink-400">
        🔒
      </div>
      <h3 className="mt-4 text-base font-semibold text-ink-900">
        {CHANNEL_LABEL[channel]} channel is private
      </h3>
      <p className="mt-1 text-sm text-ink-500">
        Only the channel owner and the master can view these leads.
      </p>
      <Link href="/dashboard" className="btn btn-outline mt-4 inline-flex">
        Back to Fresh
      </Link>
    </div>
  );
}

function ChannelEmpty({ channel, hasQuery }: { channel: ChannelKey; hasQuery: boolean }) {
  return (
    <div className="card p-12 text-center">
      <div className="mx-auto h-12 w-12 rounded-full bg-ink-100 grid place-items-center text-ink-400">
        ✦
      </div>
      <h3 className="mt-4 text-base font-semibold text-ink-900">
        {hasQuery
          ? "No leads match your search"
          : `${CHANNEL_LABEL[channel]} channel is empty`}
      </h3>
      <p className="mt-1 text-sm text-ink-500">
        {hasQuery
          ? "Try a different search term."
          : "The master can drop a new lead in from the composer above."}
      </p>
    </div>
  );
}

function ChannelLeadList({
  channel,
  leads,
  viewer,
  maxPickup,
}: {
  channel: ChannelKey;
  leads: LeadView[];
  viewer: CurrentUser;
  maxPickup: number;
}) {
  return (
    <div className="space-y-6">
      <CollapsibleSection
        storageKey={`channel:${channel}`}
        count={leads.length}
        header={
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
              {channel}
            </div>
            <div>
              <h3 className="text-base font-semibold text-ink-900">
                {CHANNEL_LABEL[channel]} channel
              </h3>
              <p className="text-xs text-ink-500">
                {leads.length} lead{leads.length === 1 ? "" : "s"} · private to the channel owner & master
              </p>
            </div>
          </div>
        }
      >
        <ul className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {leads.map((lead) => (
            <li key={lead.id}>
              <LeadCard lead={lead} viewer={viewer} teamUsers={[]} maxPickup={maxPickup} />
            </li>
          ))}
        </ul>
      </CollapsibleSection>
    </div>
  );
}

function ArchiveLockedNotice() {
  return (
    <div className="card p-12 text-center">
      <div className="mx-auto h-12 w-12 rounded-full bg-ink-100 grid place-items-center text-ink-400">
        🔒
      </div>
      <h3 className="mt-4 text-base font-semibold text-ink-900">Archive is for the master only</h3>
      <p className="mt-1 text-sm text-ink-500">
        Closed leads that have reached pickup capacity live here. Ask your master if you need access.
      </p>
      <Link href="/dashboard" className="btn btn-outline mt-4 inline-flex">
        Back to Fresh
      </Link>
    </div>
  );
}

/* ---------- Tab bar with counts (streamed) ---------- */

async function TabBarWithCounts({
  tab,
  q,
  user,
}: {
  tab: DashTab;
  q: string;
  user: CurrentUser;
}) {
  const settings = await getAppSettings();
  const cutoff = ageBoundaryDate();

  const showAHA = canSeeChannel(user, "AHA");
  const showAHB = canSeeChannel(user, "AHB");

  // Light SELECT for the default-channel pipeline. Channel-locked queries
  // run in parallel below.
  const [allLeads, ahaCount, ahbCount] = await Promise.all([
    prisma.lead.findMany({
      where: {
        AND: [
          { channel: "DEFAULT" },
          user.role === "MASTER" ? {} : freshOrMarketVisibility(user),
        ],
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        _count: { select: { assignments: true } },
        ...(user.role === "MASTER"
          ? {}
          : {
              assignments: {
                where: { userId: user.id },
                select: { userId: true },
                take: 1,
              },
            }),
      },
    }),
    showAHA ? prisma.lead.count({ where: { channel: "AHA" } }) : Promise.resolve(0),
    showAHB ? prisma.lead.count({ where: { channel: "AHB" } }) : Promise.resolve(0),
  ]);

  let freshCount = 0;
  let marketCount = 0;
  let picksCount = 0;
  let archiveCount = 0;

  for (const l of allLeads) {
    const count = l._count.assignments;
    const archiveBound =
      l.status === "APPROVED" ||
      (ARCHIVABLE_NOT_ABLE_STATUSES.includes(l.status) && count >= settings.maxPickup);

    if (archiveBound) {
      if (user.role === "MASTER") {
        archiveCount++;
        if (count > 0) picksCount++;
      }
      continue;
    }

    if (user.role !== "MASTER") {
      // mineFlag inferred from the targeted take:1 select.
      const mine = (l.assignments as { userId: number }[] | undefined)?.length ?? 0;
      if (mine) {
        picksCount++;
        continue;
      }
      if (l.status === "NEW") {
        if (count >= settings.maxPickup) continue;
      } else if (ACTIVE_STATUSES.includes(l.status)) {
        continue;
      }
    } else if (count > 0) {
      picksCount++;
    }

    if (l.createdAt > cutoff) freshCount++;
    else marketCount++;
  }

  return (
    <TabBar
      tab={tab}
      freshCount={freshCount}
      marketCount={marketCount}
      picksCount={picksCount}
      archiveCount={archiveCount}
      showAHA={showAHA}
      showAHB={showAHB}
      ahaCount={ahaCount}
      ahbCount={ahbCount}
      q={q}
    />
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
    // Non-master in Fresh / Open Market sees only leads they haven't picked
    // up. Their own picks live exclusively in the My Pick Up tab so the
    // pool view stays focused on what's grabbable.
    const available = leads.filter((l) => !l.assignees.some((a) => a.id === viewer.id));
    if (available.length === 0) {
      return (
        <div className="card p-10 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-ink-100 grid place-items-center text-ink-400">✦</div>
          <h3 className="mt-4 text-base font-semibold text-ink-900">Nothing to pick up right now</h3>
          <p className="mt-1 text-sm text-ink-500">
            Your own picks are in the <Link href="/dashboard?tab=picks" className="text-brand-700 font-medium hover:underline">My Pick Up</Link> tab.
          </p>
        </div>
      );
    }
    return (
      <div className="space-y-6">
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
                <p className="text-xs text-ink-500">
                  {available.length} open · up to {maxPickup} pickers per lead · your picks live in{" "}
                  <Link href="/dashboard?tab=picks" className="text-brand-700 font-medium hover:underline">
                    My Pick Up
                  </Link>
                </p>
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

/**
 * Archive tab is master-only and grouped by the picker user's name. A lead
 * picked up by N people appears under each of their sections, mirroring the
 * master Open view. Unassigned APPROVED leads (if any) go in their own
 * fallback bucket — shouldn't happen often but it's defensive.
 */
function ArchiveByAssignee({
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
          storageKey="archive:unassigned"
          count={unassigned.length}
          header={
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-amber-100 text-sm font-semibold text-amber-700">
                ?
              </div>
              <div>
                <h3 className="text-base font-semibold text-ink-900">Unassigned</h3>
                <p className="text-xs text-ink-500">Closed but no pickers — rare.</p>
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
          storageKey={`archive:${key}`}
          count={bucket.items.length}
          header={
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                {initials(bucket.label)}
              </div>
              <div>
                <h3 className="text-base font-semibold text-ink-900">{bucket.label}</h3>
                <p className="text-xs text-ink-500">
                  {bucket.items.length} lead{bucket.items.length === 1 ? "" : "s"} archived
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

/**
 * Non-master "My Pick Up" — flat collapsible groups by current status.
 * Lets the user scan their own portfolio without other people's leads.
 */
function MyPicksByStatus({
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
  // Display order: most actionable first
  const ORDER: LeadStatus[] = [
    "NEW",
    "CONTACT_ABLE",
    "DOCUMENTS_ABLE",
    "APPOINTMENT_ABLE",
    "CONTACT_NOT_ABLE",
    "DOCUMENTS_NOT_ABLE",
    "APPOINTMENT_NOT_ABLE",
    "SPAM_OR_MISSING",
    "REJECTED",
  ];
  const sections = ORDER.filter((s) => (byStatus.get(s)?.length ?? 0) > 0);

  return (
    <div className="space-y-6">
      {sections.map((s) => {
        const items = byStatus.get(s) ?? [];
        return (
          <CollapsibleSection
            key={s}
            storageKey={`picks:${s}`}
            count={items.length}
            header={
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                  {items.length}
                </div>
                <div>
                  <h3 className="text-base font-semibold text-ink-900">
                    {{
                      NEW: "Just picked up",
                      CONTACT_ABLE: "Contact · Able",
                      CONTACT_NOT_ABLE: "Contact · Not Able",
                      DOCUMENTS_ABLE: "Documents · Able to Get",
                      DOCUMENTS_NOT_ABLE: "Documents · Not Able",
                      APPOINTMENT_ABLE: "Appointment · Able",
                      APPOINTMENT_NOT_ABLE: "Appointment · Not Able",
                      SPAM_OR_MISSING: "Spam or Missing",
                      REJECTED: "Rejected",
                      APPROVED: "Approved",
                    }[s]}
                  </h3>
                </div>
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

/**
 * Master "My Pick Up" — every assigned lead grouped by assignee user.
 * A lead with multiple pickers appears under each of their sections.
 */
function PicksByAssignee({
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
  const buckets = new Map<string, { label: string; items: LeadView[] }>();
  for (const lead of leads) {
    for (const a of lead.assignees) {
      const key = `user:${a.id}`;
      const b = buckets.get(key) ?? { label: a.displayName, items: [] };
      b.items.push(lead);
      buckets.set(key, b);
    }
  }
  const entries = Array.from(buckets.entries()).sort((a, b) => a[1].label.localeCompare(b[1].label));

  return (
    <div className="space-y-6">
      {entries.map(([key, bucket]) => (
        <CollapsibleSection
          key={key}
          storageKey={`picks:${key}`}
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

function EmptyState({ tab, hasQuery }: { tab: "fresh" | "market" | "picks" | "archive"; hasQuery: boolean }) {
  const title = hasQuery
    ? "No leads match your search"
    : tab === "fresh"
      ? "No leads to show"
      : tab === "market"
        ? "Open Market is empty"
        : tab === "picks"
          ? "Nothing picked up yet"
          : "Archive is empty";
  const body = hasQuery
    ? "Try a different search term."
    : tab === "fresh"
      ? "Paste a new lead above, or wait for a teammate to drop one in."
      : tab === "market"
        ? "Closed leads will appear here once the team starts moving them out of New."
        : tab === "picks"
          ? "Pick up a lead from Fresh or Open Market and it'll show up here."
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
