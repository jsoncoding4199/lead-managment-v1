import { Suspense } from "react";
import Link from "next/link";
import type { LeadStatus, LeadQuality, Prisma } from "@prisma/client";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";
import {
  ACTIVE_STATUSES,
  ALWAYS_ARCHIVED_STATUSES,
  SOFT_NEGATIVE_STATUSES,
  AGE_BOUNDARY_DAYS,
} from "@/lib/leadStatus";
import { parsePrivateChannelTab, privateChannelTabKey } from "@/lib/channels";
import { LeadComposer } from "@/components/LeadComposer";
import { LeadCard } from "@/components/LeadCard";
import { TabBar } from "@/components/TabBar";
import { LeadSearchBar } from "@/components/LeadSearchBar";
import { CollapsibleSection } from "@/components/CollapsibleSection";

function leadSearchFilter(q: string): Prisma.LeadWhereInput {
  if (!q) return {};
  return {
    OR: [
      { content: { contains: q, mode: "insensitive" } },
      { remark: { contains: q, mode: "insensitive" } },
      { remarks: { some: { body: { contains: q, mode: "insensitive" } } } },
    ],
  };
}

/**
 * VISIBILITY MODEL
 *   - Public leads (privateChannelUserId = null) live in Fresh / Open
 *     Market / My Pick Up / Archive — all the team can see them.
 *   - Private leads belong to a single private-channel user. Only that
 *     user and master can see them. Each gets their own tab named after
 *     their displayName.
 */

type DashStaticTab =
  | "fresh"
  | "market"
  | "picks"
  | "archive"
  | "not_contact"
  | "not_docs"
  | "not_appt"
  | "spam"
  | "reject";

// One-status tabs → status enum they filter on. Order matches display order.
const STATUS_TAB_TO_STATUS = {
  not_contact: "CONTACT_NOT_ABLE",
  not_docs: "DOCUMENTS_NOT_ABLE",
  not_appt: "APPOINTMENT_NOT_ABLE",
  spam: "SPAM_OR_MISSING",
  reject: "REJECTED",
} as const satisfies Record<string, LeadStatus>;

type StatusTabKey = keyof typeof STATUS_TAB_TO_STATUS;

type DashTab =
  | { kind: "static"; key: DashStaticTab }
  | { kind: "private"; userId: number };

type Search = { tab?: string; q?: string };

function parseTab(raw: string | undefined): DashTab {
  const privateId = parsePrivateChannelTab(raw);
  if (privateId !== null) return { kind: "private", userId: privateId };
  switch (raw) {
    case "market":
    case "picks":
    case "archive":
    case "not_contact":
    case "not_docs":
    case "not_appt":
    case "spam":
    case "reject":
      return { kind: "static", key: raw };
    default:
      return { kind: "static", key: "fresh" };
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

  // Resolve private-channel user (if any) up front so we can label the
  // header subtitle and gate the composer.
  let privateUser: { id: number; displayName: string } | null = null;
  if (tab.kind === "private") {
    privateUser = await prisma.user.findUnique({
      where: { id: tab.userId },
      select: { id: true, displayName: true },
    });
  }

  return (
    <div className="space-y-5 md:space-y-8 max-w-6xl">
      <div>
        <h2 className="text-2xl md:text-3xl font-semibold text-ink-900 tracking-tight">Leads</h2>
        <p className="text-ink-500 mt-1 text-xs md:text-sm">
          {q && `Searching all visible leads for “${q}”.`}
          {!q && tab.kind === "static" && tab.key === "fresh" &&
            (user.role === "MASTER"
              ? "Fresh leads in the active pipeline."
              : "Your picked-up leads, plus leads still available to pick up.")}
          {tab.kind === "static" && tab.key === "market" &&
            (user.role === "MASTER"
              ? "Leads that have moved out of New, grouped by status."
              : "Leads the team has moved out of New. Approved leads are master-only.")}
          {tab.kind === "static" && tab.key === "picks" &&
            (user.role === "MASTER"
              ? "Every lead picked up by the team, grouped by who has it."
              : "Leads you've personally picked up.")}
          {tab.kind === "static" && tab.key === "archive" &&
            "Closed and approved leads — master only."}
          {tab.kind === "private" &&
            (privateUser
              ? `Private pipeline for ${privateUser.displayName} — visible only to them and master.`
              : "Private channel — visible only to the channel owner and master.")}
        </p>
      </div>

      <LeadSearchBar q={q} />

      {!q && (
        <Suspense fallback={<TabBarSkeleton />}>
          <TabBarWithCounts tab={tab} q={q} user={user} />
        </Suspense>
      )}

      {/* Composer rules — hide while searching globally. Also hide on
          master's own private inbox: createLeadAction validates the target
          is isPrivateChannel:true, which master isn't — leads only arrive
          in master's inbox via reassign. */}
      {!q && tab.kind === "static" && tab.key === "fresh" && <LeadComposer />}
      {!q && tab.kind === "private" && user.role === "MASTER" && privateUser && privateUser.id !== user.id && (
        <LeadComposer
          privateChannelUserId={privateUser.id}
          privateChannelLabel={privateUser.displayName}
        />
      )}

      {q ? (
        <Suspense fallback={<LeadsSkeleton />} key={`search:${q}`}>
          <GlobalSearchResults q={q} user={user} />
        </Suspense>
      ) : (
        <Suspense fallback={<LeadsSkeleton />} key={`${serializeTab(tab)}:${q}`}>
          <LeadsSection tab={tab} q={q} user={user} privateUser={privateUser} />
        </Suspense>
      )}
    </div>
  );
}

function serializeTab(tab: DashTab): string {
  return tab.kind === "static" ? tab.key : `private-${tab.userId}`;
}

/* ---------- Lead data section ---------- */

type LeadView = {
  id: number;
  content: string;
  remark: string | null;
  status: LeadStatus;
  quality: LeadQuality | null;
  contactState: string;
  createdAt: string;
  updatedAt: string;
  privateChannelUserId: number | null;
  createdBy: { id: number; displayName: string };
  assignees: { id: number; displayName: string }[];
};

function freshOrMarketVisibility(user: CurrentUser): Prisma.LeadWhereInput {
  if (user.role === "MASTER") return {};
  return {
    AND: [
      { status: { notIn: ALWAYS_ARCHIVED_STATUSES } },
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

function ageBoundaryDate(): Date {
  return new Date(Date.now() - AGE_BOUNDARY_DAYS * 86_400_000);
}

function isArchiveBound(lead: { status: LeadStatus }): boolean {
  return ALWAYS_ARCHIVED_STATUSES.includes(lead.status);
}

/**
 * Cross-tab visibility: every lead this user is allowed to see anywhere
 * in the dashboard (Fresh + Market + Picks + Archive + own private channel).
 *
 * Non-master union:
 *   • assigned to me (covers Picks + Active in Fresh/Market)
 *   • my own private channel
 *   • public, non-archived, non-active (NEW + soft-negatives)
 *
 * Master sees everything.
 */
function globalLeadVisibility(user: CurrentUser): Prisma.LeadWhereInput {
  if (user.role === "MASTER") return {};
  return {
    OR: [
      { assignments: { some: { userId: user.id } } },
      { privateChannelUserId: user.id },
      {
        AND: [
          { privateChannelUserId: null },
          { status: { notIn: ALWAYS_ARCHIVED_STATUSES } },
          { status: { notIn: ACTIVE_STATUSES } },
        ],
      },
    ],
  };
}

async function GlobalSearchResults({ q, user }: { q: string; user: CurrentUser }) {
  const settings = await getAppSettings();

  const [matches, teamUsers, masterReassignTargets] = await Promise.all([
    prisma.lead.findMany({
      where: { AND: [globalLeadVisibility(user), leadSearchFilter(q)] },
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
    user.role === "MASTER"
      ? prisma.user.findMany({
          where: { active: true, role: "USER", isPrivateChannel: true },
          select: { id: true, displayName: true },
          orderBy: { displayName: "asc" },
        })
      : Promise.resolve([] as { id: number; displayName: string }[]),
  ]);

  if (matches.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-ink-100 grid place-items-center text-ink-400">
          ✦
        </div>
        <h3 className="mt-4 text-base font-semibold text-ink-900">
          No leads match “{q}”
        </h3>
        <p className="mt-1 text-sm text-ink-500">
          Search covers every tab you can see. Try a different keyword.
        </p>
        <Link href="/dashboard" className="btn btn-outline mt-4 inline-flex">
          Clear search
        </Link>
      </div>
    );
  }

  const leads = matches.map(toLeadView);

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-500">
        {leads.length} match{leads.length === 1 ? "" : "es"} across all tabs
        {leads.length === 200 && " (showing first 200)"}
      </p>
      <ul className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {leads.map((lead) => (
          <li key={lead.id}>
            <LeadCard lead={lead} viewer={user} teamUsers={teamUsers} maxPickup={settings.maxPickup} reassignTargets={masterReassignTargets} />
          </li>
        ))}
      </ul>
    </div>
  );
}

async function LeadsSection({
  tab,
  q,
  user,
  privateUser,
}: {
  tab: DashTab;
  q: string;
  user: CurrentUser;
  privateUser: { id: number; displayName: string } | null;
}) {
  const settings = await getAppSettings();
  const cutoff = ageBoundaryDate();
  // Master can reassign any lead to any pipeline — fetch the list of
  // private-channel users once and thread through to every LeadCard.
  // Non-master callers get the private-branch list inside that branch.
  const masterReassignTargets =
    user.role === "MASTER"
      ? await prisma.user.findMany({
          where: { active: true, role: "USER", isPrivateChannel: true },
          select: { id: true, displayName: true },
          orderBy: { displayName: "asc" },
        })
      : [];

  /* ---------- Private channel tabs ---------- */
  if (tab.kind === "private") {
    if (user.role !== "MASTER" && user.id !== tab.userId) {
      return <ChannelLockedNotice label={privateUser?.displayName ?? "this channel"} />;
    }
    if (!privateUser) {
      return <ChannelLockedNotice label="this channel" />;
    }
    const [channelLeads, otherPrivateUsers] = await Promise.all([
      prisma.lead.findMany({
        where: {
          AND: [
            // The private tab shows two things side-by-side:
            //   1. Leads in the user's private channel (assigned by master).
            //   2. Any lead they've picked up from the public pool.
            // Same person sees both in one place — matches the "this is my
            // workload" mental model.
            {
              OR: [
                { privateChannelUserId: tab.userId },
                { assignments: { some: { userId: tab.userId } } },
              ],
            },
            leadSearchFilter(q),
          ],
        },
        orderBy: [{ updatedAt: "desc" }],
        take: 200,
        select: leadSelect,
      }),
      // Handover targets for the channel owner's Assign button — every
      // other active team user (private or regular), excluding self.
      // Master is reachable via the "Master (private inbox)" option built
      // into ReassignSheet.
      prisma.user.findMany({
        where: {
          active: true,
          role: "USER",
          NOT: { id: tab.userId },
        },
        select: { id: true, displayName: true, isPrivateChannel: true },
        orderBy: { displayName: "asc" },
      }),
    ]);
    if (channelLeads.length === 0) {
      return <ChannelEmpty label={privateUser.displayName} hasQuery={!!q} />;
    }
    const leads = channelLeads.map(toLeadView);
    return (
      <ChannelLeadList
        label={privateUser.displayName}
        leads={leads}
        viewer={user}
        maxPickup={settings.maxPickup}
        reassignTargets={otherPrivateUsers}
      />
    );
  }

  /* ---------- My Pick Up tab ---------- */
  if (tab.key === "picks") {
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
            { privateChannelUserId: null },
            baseWhere,
            leadSearchFilter(q),
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
      <PicksByAssignee leads={leads} viewer={user} teamUsers={teamUsers} maxPickup={settings.maxPickup} reassignTargets={masterReassignTargets} />
    ) : (
      <MyPicksByStatus leads={leads} viewer={user} teamUsers={teamUsers} maxPickup={settings.maxPickup} reassignTargets={masterReassignTargets} />
    );
  }

  /* ---------- Single-status tabs (visible to all) ---------- */
  if (tab.key in STATUS_TAB_TO_STATUS) {
    const status = STATUS_TAB_TO_STATUS[tab.key as StatusTabKey];
    const [statusLeads, teamUsers] = await Promise.all([
      prisma.lead.findMany({
        where: {
          AND: [
            { privateChannelUserId: null },
            { status },
            leadSearchFilter(q),
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
    if (statusLeads.length === 0) {
      return <EmptyState tab={tab.key} hasQuery={!!q} />;
    }
    const leads = statusLeads.map(toLeadView);
    return <OpenGrouped leads={leads} viewer={user} teamUsers={teamUsers} maxPickup={settings.maxPickup} reassignTargets={masterReassignTargets} />;
  }

  /* ---------- Archive tab — master only ---------- */
  if (tab.key === "archive") {
    if (user.role !== "MASTER") {
      return <ArchiveLockedNotice />;
    }

    const [archivable, teamUsers] = await Promise.all([
      prisma.lead.findMany({
        where: {
          AND: [
            { privateChannelUserId: null },
            { status: { in: ALWAYS_ARCHIVED_STATUSES } },
            leadSearchFilter(q),
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

    const filtered = archivable.filter((l) => isArchiveBound(l));
    if (filtered.length === 0) {
      return <EmptyState tab="archive" hasQuery={!!q} />;
    }
    const leads = filtered.map(toLeadView);
    return <ArchiveByAssignee leads={leads} viewer={user} teamUsers={teamUsers} maxPickup={settings.maxPickup} reassignTargets={masterReassignTargets} />;
  }

  /* ---------- Fresh + Open Market tabs ---------- */

  const dateFilter: Prisma.LeadWhereInput = tab.key === "fresh"
    ? { createdAt: { gt: cutoff } }
    : { createdAt: { lte: cutoff } };

  const visibilityFilter = freshOrMarketVisibility(user);

  const [rawLeads, teamUsers] = await Promise.all([
    prisma.lead.findMany({
      where: {
        AND: [
          { privateChannelUserId: null },
          dateFilter,
          visibilityFilter,
          leadSearchFilter(q),
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

  const visibleLeads = rawLeads.filter((l) => {
    if (isArchiveBound(l)) return false;
    if (user.role === "MASTER") return true;
    const iAmAssigned = l.assignments.some((a) => a.user.id === user.id);
    if (iAmAssigned) return true;
    if (l.status === "NEW") {
      return l.assignments.length < settings.maxPickup;
    }
    if (SOFT_NEGATIVE_STATUSES.includes(l.status)) return true;
    return false;
  });

  if (visibleLeads.length === 0) {
    return <EmptyState tab={tab.key} hasQuery={!!q} />;
  }

  const leads = visibleLeads.map(toLeadView);
  return <OpenGrouped leads={leads} viewer={user} teamUsers={teamUsers} maxPickup={settings.maxPickup} reassignTargets={masterReassignTargets} />;
}

/* ---------- Shared Prisma select + projection ---------- */

const leadSelect = {
  id: true,
  content: true,
  remark: true,
  status: true,
  quality: true,
  contactState: true,
  createdAt: true,
  updatedAt: true,
  privateChannelUserId: true,
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
  contactState: string;
  createdAt: Date;
  updatedAt: Date;
  privateChannelUserId: number | null;
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
    contactState: l.contactState,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    privateChannelUserId: l.privateChannelUserId,
    createdBy: l.createdBy,
    assignees: l.assignments.map((a) => a.user),
  };
}

function ChannelLockedNotice({ label }: { label: string }) {
  return (
    <div className="card p-12 text-center">
      <div className="mx-auto h-12 w-12 rounded-full bg-ink-100 grid place-items-center text-ink-400">
        🔒
      </div>
      <h3 className="mt-4 text-base font-semibold text-ink-900">
        {label}&apos;s pipeline is private
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

function ChannelEmpty({ label, hasQuery }: { label: string; hasQuery: boolean }) {
  return (
    <div className="card p-12 text-center">
      <div className="mx-auto h-12 w-12 rounded-full bg-ink-100 grid place-items-center text-ink-400">
        ✦
      </div>
      <h3 className="mt-4 text-base font-semibold text-ink-900">
        {hasQuery ? "No leads match your search" : `${label}'s pipeline is empty`}
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
  label,
  leads,
  viewer,
  maxPickup,
  reassignTargets,
}: {
  label: string;
  leads: LeadView[];
  viewer: CurrentUser;
  maxPickup: number;
  reassignTargets: { id: number; displayName: string }[];
}) {
  return (
    <div className="space-y-6">
      <CollapsibleSection
        storageKey={`channel:${label}`}
        count={leads.length}
        defaultOpen={false}
        header={
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
              {initials(label)}
            </div>
            <div>
              <h3 className="text-base font-semibold text-ink-900">{label}</h3>
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
              <LeadCard
                lead={lead}
                viewer={viewer}
                teamUsers={[]}
                maxPickup={maxPickup}
                reassignTargets={reassignTargets}
              />
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

  // Private-channel users this viewer can SEE as tabs:
  //   master   → all active private-channel users
  //   private  → just themselves
  //   normal   → none
  const visiblePrivateUsers =
    user.role === "MASTER"
      ? [
          // Master's own private inbox tab — receives reassigned leads. Label
          // it explicitly so it doesn't read like just another user channel.
          { id: user.id, displayName: `${user.displayName} (inbox)` },
          ...(await prisma.user.findMany({
            where: { active: true, role: "USER", isPrivateChannel: true },
            select: { id: true, displayName: true },
            orderBy: { displayName: "asc" },
          })),
        ]
      : user.isPrivateChannel
        ? [{ id: user.id, displayName: user.displayName }]
        : [];

  const [allLeads, privateCountsRaw] = await Promise.all([
    prisma.lead.findMany({
      where: {
        AND: [
          { privateChannelUserId: null },
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
    // ponytail: N+1 count, fine because visiblePrivateUsers is bounded
    // (master + a handful of private users). Matches the OR(channel,
    // assignment) query used in the private tab body, so the count and the
    // visible list stay in sync.
    Promise.all(
      visiblePrivateUsers.map((u) =>
        prisma.lead.count({
          where: {
            OR: [
              { privateChannelUserId: u.id },
              { assignments: { some: { userId: u.id } } },
            ],
          },
        }).then((count) => ({ userId: u.id, count }))
      )
    ),
  ]);

  const privateCountsMap = new Map<number, number>();
  for (const r of privateCountsRaw) {
    privateCountsMap.set(r.userId, r.count);
  }

  let freshCount = 0;
  let marketCount = 0;
  let picksCount = 0;
  let archiveCount = 0;
  const statusCounts: Record<StatusTabKey, number> = {
    not_contact: 0,
    not_docs: 0,
    not_appt: 0,
    spam: 0,
    reject: 0,
  };

  for (const l of allLeads) {
    const count = l._count.assignments;
    const archiveBound = ALWAYS_ARCHIVED_STATUSES.includes(l.status);

    // Status tabs count against the same public pool. Master + non-master
    // alike see per-status buckets.
    if (l.status === "CONTACT_NOT_ABLE") statusCounts.not_contact++;
    else if (l.status === "DOCUMENTS_NOT_ABLE") statusCounts.not_docs++;
    else if (l.status === "APPOINTMENT_NOT_ABLE") statusCounts.not_appt++;
    else if (l.status === "SPAM_OR_MISSING") statusCounts.spam++;
    else if (l.status === "REJECTED") statusCounts.reject++;

    if (archiveBound) {
      if (user.role === "MASTER") {
        archiveCount++;
        if (count > 0) picksCount++;
      }
      continue;
    }

    if (user.role !== "MASTER") {
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

  const showArchive = user.role === "MASTER";

  return (
    <TabBar
      activeTab={serializeTab(tab)}
      freshCount={freshCount}
      marketCount={marketCount}
      picksCount={picksCount}
      archiveCount={archiveCount}
      showArchive={showArchive}
      statusCounts={statusCounts}
      privateChannels={visiblePrivateUsers.map((u) => ({
        key: privateChannelTabKey(u.id),
        label: u.displayName,
        count: privateCountsMap.get(u.id) ?? 0,
      }))}
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
        </section>
      ))}
    </div>
  );
}

/* ---------- Grouped renderers ---------- */

function OpenGrouped({
  leads,
  viewer,
  teamUsers,
  maxPickup,
  reassignTargets = [],
}: {
  leads: LeadView[];
  viewer: CurrentUser;
  teamUsers: { id: number; displayName: string }[];
  maxPickup: number;
  reassignTargets?: { id: number; displayName: string }[];
}) {
  const visibleLeads = viewer.role === "MASTER"
    ? leads
    : leads.filter((l) => !l.assignees.some((a) => a.id === viewer.id));

  if (visibleLeads.length === 0) {
    return (
      <div className="card p-10 text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-ink-100 grid place-items-center text-ink-400">✦</div>
        <h3 className="mt-4 text-base font-semibold text-ink-900">Nothing to show right now</h3>
        <p className="mt-1 text-sm text-ink-500">
          {viewer.role === "MASTER"
            ? "No leads in this view."
            : (
              <>
                Your own picks live in the{" "}
                <Link href="/dashboard?tab=picks" className="text-brand-700 font-medium hover:underline">
                  My Pick Up
                </Link>{" "}
                tab.
              </>
            )}
        </p>
      </div>
    );
  }

  const buckets = new Map<string, { label: string; items: LeadView[] }>();
  for (const lead of visibleLeads) {
    const creator = lead.createdBy;
    const key = creator ? `user:${creator.id}` : "unknown";
    const label = creator?.displayName ?? "Unknown";
    const bucket = buckets.get(key) ?? { label, items: [] };
    bucket.items.push(lead);
    buckets.set(key, bucket);
  }

  const entries = Array.from(buckets.entries()).sort(
    (a, b) => a[1].label.localeCompare(b[1].label)
  );

  return (
    <div className="space-y-6">
      {entries.map(([key, bucket]) => (
        <CollapsibleSection
          key={key}
          storageKey={`open:by-creator:${key}`}
          count={bucket.items.length}
          defaultOpen={false}
          header={
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                {initials(bucket.label)}
              </div>
              <div>
                <h3 className="text-base font-semibold text-ink-900">
                  {bucket.label}
                </h3>
                <p className="text-xs text-ink-500">
                  {bucket.items.length} lead{bucket.items.length === 1 ? "" : "s"} added by {bucket.label}
                </p>
              </div>
            </div>
          }
        >
          <ul className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {bucket.items.map((lead) => (
              <li key={lead.id}>
                <LeadCard lead={lead} viewer={viewer} teamUsers={teamUsers} maxPickup={maxPickup} reassignTargets={reassignTargets} />
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ))}
    </div>
  );
}

function ArchiveByAssignee({
  leads,
  viewer,
  teamUsers,
  maxPickup,
  reassignTargets = [],
}: {
  leads: LeadView[];
  viewer: CurrentUser;
  teamUsers: { id: number; displayName: string }[];
  maxPickup: number;
  reassignTargets?: { id: number; displayName: string }[];
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
          defaultOpen={false}
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
                <LeadCard lead={lead} viewer={viewer} teamUsers={teamUsers} maxPickup={maxPickup} reassignTargets={reassignTargets} />
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
          defaultOpen={false}
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
                <LeadCard lead={lead} viewer={viewer} teamUsers={teamUsers} maxPickup={maxPickup} reassignTargets={reassignTargets} />
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ))}
    </div>
  );
}

function MyPicksByStatus({
  leads,
  viewer,
  teamUsers,
  maxPickup,
  reassignTargets = [],
}: {
  leads: LeadView[];
  viewer: CurrentUser;
  teamUsers: { id: number; displayName: string }[];
  maxPickup: number;
  reassignTargets?: { id: number; displayName: string }[];
}) {
  const byStatus = new Map<LeadStatus, LeadView[]>();
  for (const lead of leads) {
    const arr = byStatus.get(lead.status) ?? [];
    arr.push(lead);
    byStatus.set(lead.status, arr);
  }
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
            defaultOpen={false}
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
                      RECYCLED: "Recycled",
                    }[s]}
                  </h3>
                </div>
              </div>
            }
          >
            <ul className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {items.map((lead) => (
                <li key={lead.id}>
                  <LeadCard lead={lead} viewer={viewer} teamUsers={teamUsers} maxPickup={maxPickup} reassignTargets={reassignTargets} />
                </li>
              ))}
            </ul>
          </CollapsibleSection>
        );
      })}
    </div>
  );
}

function PicksByAssignee({
  leads,
  viewer,
  teamUsers,
  maxPickup,
  reassignTargets = [],
}: {
  leads: LeadView[];
  viewer: CurrentUser;
  teamUsers: { id: number; displayName: string }[];
  maxPickup: number;
  reassignTargets?: { id: number; displayName: string }[];
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
          defaultOpen={false}
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
                <LeadCard lead={lead} viewer={viewer} teamUsers={teamUsers} maxPickup={maxPickup} reassignTargets={reassignTargets} />
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ))}
    </div>
  );
}

function EmptyState({ tab, hasQuery }: { tab: DashStaticTab; hasQuery: boolean }) {
  const title = hasQuery
    ? "No leads match your search"
    : tab === "fresh"
      ? "No leads to show"
      : tab === "market"
        ? "Open Market is empty"
        : tab === "picks"
          ? "Nothing picked up yet"
          : tab === "archive"
            ? "Archive is empty"
            : "No leads with this status yet";
  const body = hasQuery
    ? "Try a different search term."
    : tab === "fresh"
      ? "Paste a new lead above, or wait for a teammate to drop one in."
      : tab === "market"
        ? "Closed leads will appear here once the team starts moving them out of New."
        : tab === "picks"
          ? "Pick up a lead from Fresh or Open Market and it'll show up here."
          : tab === "archive"
            ? "Nothing has been moved to the long-term archive yet."
            : "Leads set to this status will land here.";
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
