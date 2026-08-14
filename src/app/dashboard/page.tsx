import { Suspense } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { LeadComposer } from "@/components/LeadComposer";
import { OwnLeadImport } from "@/components/OwnLeadImport";
import { LeadCard } from "@/components/LeadCard";
import { TabBar } from "@/components/TabBar";
import { LeadSearchBar } from "@/components/LeadSearchBar";
import { LeadFilterBar } from "@/components/LeadFilterBar";
import { CollapsibleSection } from "@/components/CollapsibleSection";

function leadSearchFilter(q: string): Prisma.LeadWhereInput {
  if (!q) return {};
  return {
    OR: [
      { content: { contains: q, mode: "insensitive" } },
      { remark: { contains: q, mode: "insensitive" } },
      { remarks: { some: { body: { contains: q, mode: "insensitive" } } } },
      // Structured fields + source name so a search like "Ezy" or "FB"
      // (or a customer name / phone) matches too.
      { name: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { source: { is: { name: { contains: q, mode: "insensitive" } } } },
      { location: { is: { name: { contains: q, mode: "insensitive" } } } },
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
  | "own"
  | "general"
  | "fresh"
  | "market"
  | "picks"
  | "approved"
  | "archive"
  | "able_contact"
  | "able_docs"
  | "able_appt"
  | "not_contact"
  | "not_docs"
  | "not_appt"
  | "spam"
  | "reject";

// One-status tabs → status enum they filter on. Order matches display order.
const STATUS_TAB_TO_STATUS = {
  able_contact: "CONTACT_ABLE",
  able_docs: "DOCUMENTS_ABLE",
  able_appt: "APPOINTMENT_ABLE",
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

type Search = { tab?: string; q?: string; fu?: string; fs?: string; fl?: string; p?: string; sg?: string; sort?: string };

/** Date sort for every pipeline list. "new" = newest first (default),
 *  "old" = oldest first (longest-waiting / most days). */
type SortKey = "new" | "old";
function parseSort(raw: string | undefined): SortKey {
  return raw === "old" ? "old" : "new";
}
function leadOrderBy(sort: SortKey): Prisma.LeadOrderByWithRelationInput[] {
  return [{ createdAt: sort === "old" ? "asc" : "desc" }];
}

/**
 * Rows per page. Every lead is a stateful client component, so this is the
 * ceiling on how many mount at once — kept small because Own can hold
 * thousands of imported leads. Page through with `?p=`.
 */
const LEAD_PAGE_SIZE = 50;

/**
 * Own-tab status filter (`?sg=`): one chip per stage, Able and Not able
 * counted together — the master wants "who's at Documents", not which
 * side of it they landed on.
 */
const STAGE_GROUPS = {
  contact: { label: "Contact", short: "Contact", statuses: ["CONTACT_ABLE", "CONTACT_NOT_ABLE"] },
  documents: { label: "Documents", short: "Docs", statuses: ["DOCUMENTS_ABLE", "DOCUMENTS_NOT_ABLE"] },
  appointment: { label: "Appointment", short: "Appt", statuses: ["APPOINTMENT_ABLE", "APPOINTMENT_NOT_ABLE"] },
} satisfies Record<string, { label: string; short: string; statuses: LeadStatus[] }>;

type StageGroup = keyof typeof STAGE_GROUPS;

function parseStageGroup(raw: string | undefined): StageGroup | null {
  return raw && raw in STAGE_GROUPS ? (raw as StageGroup) : null;
}

function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 1 ? Math.floor(n) : 1;
}

/**
 * Cross-tab filter clause: narrow leads to a specific creator (fu), lead
 * source (fs) and/or location (fl). All optional; returns {} when none are
 * set so it's a no-op alongside the other AND filters.
 */
function leadFilterWhere(
  creatorIds: number[],
  sourceIds: number[],
  locationIds: number[]
): Prisma.LeadWhereInput {
  const and: Prisma.LeadWhereInput[] = [];
  if (creatorIds.length) and.push({ createdById: { in: creatorIds } });
  if (sourceIds.length) and.push({ sourceId: { in: sourceIds } });
  if (locationIds.length) and.push({ locationId: { in: locationIds } });
  return and.length ? { AND: and } : {};
}

/** "1,3,5" → [1,3,5]; drops blanks/non-positives. Used for the multi-select
 *  filters whose fu/fs/fl params hold a comma-separated id list. */
function parseIds(raw: string | undefined): number[] {
  return (raw ?? "")
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function parseTab(raw: string | undefined): DashTab {
  const privateId = parsePrivateChannelTab(raw);
  if (privateId !== null) return { kind: "private", userId: privateId };
  switch (raw) {
    case "own":
    case "general":
    case "market":
    case "picks":
    case "approved":
    case "archive":
    case "able_contact":
    case "able_docs":
    case "able_appt":
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
  const q = (sp.q ?? "").trim();
  const filterCreatorIds = parseIds(sp.fu);
  const filterSourceIds = parseIds(sp.fs);
  const filterLocationIds = parseIds(sp.fl);

  // Everyone — master included — lands on Fresh by default (parseTab
  // returns "fresh" when no tab param is present).

  const tab: DashTab = parseTab(sp.tab);

  // All four lookups are independent — run them in one round-trip batch
  // instead of four sequential awaits (noticeably faster on mobile links).
  //   privateUser    — labels the header + gates the composer on a private tab
  //   assignableUsers— composer's assign chips (every active user)
  //   leadSources /  — composer pickers, rendered server-side so there's no
  //   leadLocations    client roundtrip on open
  const [privateUser, assignableUsers, leadSources, leadLocations] = await Promise.all([
    tab.kind === "private"
      ? prisma.user.findUnique({
          where: { id: tab.userId },
          select: { id: true, displayName: true },
        })
      : Promise.resolve(null),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, displayName: true, role: true },
      orderBy: [{ role: "asc" }, { displayName: "asc" }],
    }),
    prisma.leadSource.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.leadLocation.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-3 md:space-y-6 max-w-6xl">
      <div>
        <h2 className="text-lg md:text-3xl font-semibold text-ink-900 tracking-tight">Leads</h2>
        <p className="hidden md:block text-ink-500 mt-1 text-xs md:text-sm">
          {q && `Searching all visible leads for “${q}”.`}
          {!q && tab.kind === "static" && tab.key === "own" &&
            "Your private list — visible only to you, grouped by day. New leads get a 1-hour follow-up reminder."}
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
          <TabBarWithCounts tab={tab} user={user} />
        </Suspense>
      )}

      <LeadFilterBar
        users={assignableUsers.map((u) => ({ id: u.id, displayName: u.displayName }))}
        sources={leadSources}
        locations={leadLocations}
        creatorIds={filterCreatorIds}
        sourceIds={filterSourceIds}
        locationIds={filterLocationIds}
        sort={parseSort(sp.sort)}
      />

      {/* Composer rules — hide while searching globally. Non-masters only
          see it on Fresh (public composer). Master can drop a lead from
          any tab: on a private tab the lead lands in that channel, on any
          static tab it goes into the public Fresh pipeline. */}
      {/* "Own" tab (master-only): composer drops leads into the master's
          private Own list + triggers the default 1-hour reminder. Compose
          and import share one row; items-start so expanding one doesn't
          stretch the other to match its height. */}
      {!q && tab.kind === "static" && tab.key === "own" && user.role === "MASTER" && (
        <div className="grid grid-cols-2 items-start gap-2">
          <LeadComposer
            sources={leadSources}
            locations={leadLocations}
            isOwn
            canManage={user.role === "MASTER"}
          />
          <OwnLeadImport sources={leadSources} />
        </div>
      )}
      {/* Other static tabs: every user gets the composer (paste auto-detect,
          source picker, assign chips). The lead always lands in the public
          Fresh pipeline regardless of which tab it was composed from. */}
      {!q && tab.kind === "static" && tab.key !== "own" && tab.key !== "general" && (
        <LeadComposer sources={leadSources}
          locations={leadLocations} canManage={user.role === "MASTER"} />
      )}
      {/* Private tab composer: master anywhere, or the channel owner on
          their own tab — so private users can paste leads (with the
          name/phone auto-detect) straight into their pipeline. */}
      {!q &&
        tab.kind === "private" &&
        privateUser &&
        (user.role === "MASTER" || user.id === privateUser.id) && (
          <LeadComposer
            sources={leadSources}
          locations={leadLocations}
            canManage={user.role === "MASTER"}
            privateChannelUserId={privateUser.id}
            privateChannelLabel={
              privateUser.id === user.id ? "my pipeline" : privateUser.displayName
            }
          />
        )}

      {q ? (
        <Suspense fallback={<LeadsSkeleton />} key={`search:${q}:${filterCreatorIds}:${filterSourceIds}:${filterLocationIds}:${sp.sort ?? ""}`}>
          <GlobalSearchResults q={q} user={user} creatorId={filterCreatorIds} sourceId={filterSourceIds} locationId={filterLocationIds} sort={parseSort(sp.sort)} />
        </Suspense>
      ) : (
        <Suspense fallback={<LeadsSkeleton />} key={`${serializeTab(tab)}:${filterCreatorIds}:${filterSourceIds}:${filterLocationIds}:${sp.sort ?? ""}:${sp.p ?? ""}`}>
          <LeadsSection tab={tab} q={q} user={user} privateUser={privateUser} creatorId={filterCreatorIds} sourceId={filterSourceIds} locationId={filterLocationIds} page={parsePage(sp.p)} statusGroup={parseStageGroup(sp.sg)} sort={parseSort(sp.sort)} />
        </Suspense>
      )}
    </div>
  );
}

/** Tab URL that keeps the active search + filters. */
function tabHref(tabKey: string, o: {
  q: string;
  creatorId: number[];
  sourceId: number[];
  locationId: number[];
  page?: number;
  sg?: StageGroup | null;
  sort?: SortKey;
}): string {
  const p = new URLSearchParams({ tab: tabKey });
  if (o.q) p.set("q", o.q);
  if (o.creatorId.length) p.set("fu", o.creatorId.join(","));
  if (o.sourceId.length) p.set("fs", o.sourceId.join(","));
  if (o.locationId.length) p.set("fl", o.locationId.join(","));
  if (o.page && o.page > 1) p.set("p", String(o.page));
  if (o.sg) p.set("sg", o.sg);
  if (o.sort && o.sort !== "new") p.set("sort", o.sort);
  return `/dashboard?${p.toString()}`;
}

/**
 * Stage filter row (All / Contact / Documents / Appointment). Counts each
 * stage's Able + Not able together — the question is "how far did this
 * lead get", not which side of the stage it landed on. Rendered on the
 * Own tab and on every private channel tab.
 */
async function StageRow({
  tabKey,
  where,
  active,
  q,
  creatorId,
  sourceId,
  locationId,
  sort,
}: {
  tabKey: string;
  /** The tab's unfiltered-by-stage predicate — what the counts run over. */
  where: Prisma.LeadWhereInput;
  active: StageGroup | null;
  q: string;
  creatorId: number[];
  sourceId: number[];
  locationId: number[];
  sort: SortKey;
}) {
  const rows = await prisma.lead.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
  });
  const countOf = (g: StageGroup) =>
    rows
      .filter((r) => (STAGE_GROUPS[g].statuses as LeadStatus[]).includes(r.status))
      .reduce((n, r) => n + r._count._all, 0);
  const link = (sg?: StageGroup) =>
    tabHref(tabKey, { q, creatorId, sourceId, locationId, sg, sort });

  return (
    <div className="flex gap-1 rounded-xl bg-white/95 p-1 ring-1 ring-ink-200 shadow-soft">
      <StageChip
        label="All"
        count={rows.reduce((n, r) => n + r._count._all, 0)}
        href={link()}
        active={active === null}
      />
      {(Object.keys(STAGE_GROUPS) as StageGroup[]).map((g) => (
        <StageChip
          key={g}
          label={STAGE_GROUPS[g].label}
          short={STAGE_GROUPS[g].short}
          count={countOf(g)}
          href={link(g)}
          active={active === g}
        />
      ))}
    </div>
  );
}

/**
 * Newer / Older pager. Rendered only when the list actually spills over a
 * page, so short lists look exactly as they did before.
 */
function Pager({
  page,
  shown,
  total,
  hrefFor,
}: {
  page: number;
  shown: number;
  total: number;
  hrefFor: (page: number) => string;
}) {
  const first = (page - 1) * LEAD_PAGE_SIZE + 1;
  const last = first + shown - 1;
  const hasPrev = page > 1;
  const hasNext = last < total;
  if (!hasPrev && !hasNext) return null;

  return (
    <div className="card flex items-center justify-between gap-2 p-2.5">
      <PagerLink href={hrefFor(page - 1)} disabled={!hasPrev} label="← Newer" />
      <span className="text-[11px] text-ink-600 tabular-nums">
        {first}–{last} of {total}
      </span>
      <PagerLink href={hrefFor(page + 1)} disabled={!hasNext} label="Older →" />
    </div>
  );
}

function PagerLink({
  href,
  disabled,
  label,
}: {
  href: string;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return (
      <span className="inline-flex h-8 items-center rounded-lg px-3 text-[11px] font-medium text-ink-300">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="inline-flex h-8 items-center rounded-lg px-3 text-[11px] font-medium text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50"
    >
      {label}
    </Link>
  );
}

/** One stage chip in a StageRow. */
function StageChip({
  label,
  short,
  count,
  href,
  active,
}: {
  label: string;
  /** Abbreviation shown on phones, where the full word wouldn't fit. */
  short?: string;
  count: number;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-9 flex-1 min-w-0 items-center justify-center gap-1 rounded-lg px-1.5",
        "text-[12px] font-medium whitespace-nowrap transition-colors",
        active
          ? "bg-ink-900 text-white shadow-sm"
          : "text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50"
      )}
    >
      <span className="sm:hidden">{short ?? label}</span>
      <span className="hidden sm:inline">{label}</span>
      <span
        className={cn(
          "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 tabular-nums leading-none",
          active ? "bg-white/15 text-white ring-white/25" : "bg-ink-100 text-ink-600 ring-ink-200"
        )}
      >
        {count}
      </span>
    </Link>
  );
}

function serializeTab(tab: DashTab): string {
  return tab.kind === "static" ? tab.key : `private-${tab.userId}`;
}

/* ---------- Lead data section ---------- */

type LeadView = {
  id: number;
  content: string;
  name: string | null;
  phone: string | null;
  source: { id: number; name: string } | null;
  location: { id: number; name: string } | null;
  remark: string | null;
  status: LeadStatus;
  quality: LeadQuality | null;
  contactState: string;
  createdAt: string;
  updatedAt: string;
  privateChannelUserId: number | null;
  ackedAt: string | null;
  ackedBy: { id: number; displayName: string } | null;
  createdBy: { id: number; displayName: string };
  assignees: { id: number; displayName: string }[];
  myReminderAt: string | null;
};

/**
 * A public lead that has been assigned to master has been handed into the
 * master pipeline (it shows in the AH inbox via that assignment). It has
 * left the open market, so keep it out of Fresh / Open Market / the status
 * tabs — otherwise the same lead appears in both places. "Send to master"
 * sets privateChannelUserId and never hits this; the composer/Assign path
 * only creates the assignment, which is what this catches.
 */
const notInMasterPipeline: Prisma.LeadWhereInput = {
  NOT: { assignments: { some: { user: { role: "MASTER" } } } },
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

async function GlobalSearchResults({
  q,
  user,
  creatorId,
  sourceId,
  locationId,
  sort,
}: {
  q: string;
  user: CurrentUser;
  creatorId: number[];
  sourceId: number[];
  locationId: number[];
  sort: SortKey;
}) {
  const settings = await getAppSettings();

  const [matches, teamUsers, masterReassignTargets] = await Promise.all([
    prisma.lead.findMany({
      where: { AND: [globalLeadVisibility(user), leadSearchFilter(q), leadFilterWhere(creatorId, sourceId, locationId)] },
      orderBy: leadOrderBy(sort),
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
        <Link href="/dashboard?tab=fresh" className="btn btn-outline mt-4 inline-flex">
          Clear search
        </Link>
      </div>
    );
  }

  const leads = await toLeadViewsForUser(matches, user.id);

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
  creatorId,
  sourceId,
  locationId,
  page,
  statusGroup,
  sort,
}: {
  tab: DashTab;
  q: string;
  user: CurrentUser;
  privateUser: { id: number; displayName: string } | null;
  creatorId: number[];
  sourceId: number[];
  locationId: number[];
  page: number;
  statusGroup: StageGroup | null;
  sort: SortKey;
}) {
  const filterWhere = leadFilterWhere(creatorId, sourceId, locationId);
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
    // Everything in this channel that survives search + filters. The stage
    // chips narrow it further and are counted against this base.
    const channelBase: Prisma.LeadWhereInput = {
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
            // Master's "Own" leads live under privateChannelUserId=master.id
            // but belong only in the dedicated Own tab — keep them out of
            // the inbox. Only Own leads carry isOwn=true, so this is a no-op
            // for every other private channel.
            { isOwn: false },
        leadSearchFilter(q),
        filterWhere,
      ],
    };
    const channelWhere: Prisma.LeadWhereInput = statusGroup
      ? { AND: [channelBase, { status: { in: STAGE_GROUPS[statusGroup].statuses } }] }
      : channelBase;
    const [channelLeads, channelTotal, otherPrivateUsers] = await Promise.all([
      prisma.lead.findMany({
        where: channelWhere,
        orderBy: leadOrderBy(sort),
        skip: (page - 1) * LEAD_PAGE_SIZE,
        take: LEAD_PAGE_SIZE,
        select: leadSelect,
      }),
      prisma.lead.count({ where: channelWhere }),
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
    const channelStageRow = (
      <StageRow
        tabKey={privateChannelTabKey(tab.userId)}
        where={channelBase}
        active={statusGroup}
        q={q}
        creatorId={creatorId}
        sourceId={sourceId}
        locationId={locationId}
        sort={sort}
      />
    );
    if (channelLeads.length === 0) {
      return (
        <div className="space-y-3">
          {channelStageRow}
          <ChannelEmpty label={privateUser.displayName} hasQuery={!!q} />
        </div>
      );
    }
    const leads = await toLeadViewsForUser(channelLeads, user.id);

    // Every private tab — master's inbox included — is a flat list under
    // the stage row. Grouping by who assigned the lead was replaced by
    // grouping by how far the lead got.
    return (
      <div className="space-y-3">
        {channelStageRow}
        <ChannelLeadList
          label={privateUser.displayName}
          leads={leads}
          viewer={user}
          maxPickup={settings.maxPickup}
          reassignTargets={otherPrivateUsers}
        />
        <Pager
          page={page}
          shown={channelLeads.length}
          total={channelTotal}
          hrefFor={(n) =>
            tabHref(privateChannelTabKey(tab.userId), {
              q,
              creatorId,
              sourceId,
              locationId,
              page: n,
              sg: statusGroup,
              sort,
            })
          }
        />
      </div>
    );
  }

  /* ---------- "General" tab — master-only view of every private channel ---------- */
  if (tab.key === "general") {
    if (user.role !== "MASTER") {
      return <ChannelLockedNotice label="this view" />;
    }
    const privateUsers = await prisma.user.findMany({
      where: { active: true, role: "USER", isPrivateChannel: true },
      select: { id: true },
    });
    // Every private channel: the master's own inbox + each private-channel
    // user. Union of channel-owned and assigned leads, minus Own-list leads.
    const channelUserIds = [user.id, ...privateUsers.map((u) => u.id)];
    const generalWhere: Prisma.LeadWhereInput = {
      AND: [
        {
          OR: [
            { privateChannelUserId: { in: channelUserIds } },
            { assignments: { some: { userId: { in: channelUserIds } } } },
          ],
        },
        { isOwn: false },
        leadSearchFilter(q),
        filterWhere,
      ],
    };
    const [generalLeads, generalTotal] = await Promise.all([
      prisma.lead.findMany({
        where: generalWhere,
        orderBy: leadOrderBy(sort),
        skip: (page - 1) * LEAD_PAGE_SIZE,
        take: LEAD_PAGE_SIZE,
        select: leadSelect,
      }),
      prisma.lead.count({ where: generalWhere }),
    ]);
    if (generalLeads.length === 0) {
      return <EmptyState tab="general" hasQuery={!!q} />;
    }
    const leads = await toLeadViewsForUser(generalLeads, user.id);
    return (
      <div className="space-y-3">
        <ul className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {leads.map((lead) => (
            <li key={lead.id}>
              <LeadCard lead={lead} viewer={user} teamUsers={[]} maxPickup={settings.maxPickup} reassignTargets={masterReassignTargets} />
            </li>
          ))}
        </ul>
        <Pager
          page={page}
          shown={generalLeads.length}
          total={generalTotal}
          hrefFor={(n) => tabHref("general", { q, creatorId, sourceId, locationId, page: n, sort })}
        />
      </div>
    );
  }

  /* ---------- "Own" tab — master's private list, grouped by day ---------- */
  if (tab.key === "own") {
    if (user.role !== "MASTER") {
      return <ChannelLockedNotice label="this list" />;
    }
    // Base = everything in Own that survives search + filters; the status
    // chips narrow it further and are counted against this base.
    const ownBase: Prisma.LeadWhereInput = {
      AND: [
        { isOwn: true },
        { privateChannelUserId: user.id },
        leadSearchFilter(q),
        filterWhere,
      ],
    };
    const ownWhere: Prisma.LeadWhereInput = statusGroup
      ? { AND: [ownBase, { status: { in: STAGE_GROUPS[statusGroup].statuses } }] }
      : ownBase;
    const statusRow = (
      <StageRow
        tabKey="own"
        where={ownBase}
        active={statusGroup}
        q={q}
        creatorId={creatorId}
        sourceId={sourceId}
        locationId={locationId}
        sort={sort}
      />
    );
    // The tab badge counts every Own lead, so the list has to say when it
    // is showing fewer — otherwise 433 in the badge and 300 on screen just
    // looks like missing leads.
    const [ownLeads, ownTotal] = await Promise.all([
      prisma.lead.findMany({
        where: ownWhere,
        orderBy: leadOrderBy(sort),
        skip: (page - 1) * LEAD_PAGE_SIZE,
        take: LEAD_PAGE_SIZE,
        select: leadSelect,
      }),
      prisma.lead.count({ where: ownWhere }),
    ]);
    if (ownLeads.length === 0) {
      return (
        <div className="space-y-3">
          {statusRow}
          <EmptyState tab="own" hasQuery={!!q} />
          {/* Keeps a way back if a stale ?p= lands past the last page. */}
          <Pager
            page={page}
            shown={0}
            total={ownTotal}
            hrefFor={(n) =>
              tabHref("own", { q, creatorId, sourceId, locationId, page: n, sg: statusGroup, sort })
            }
          />
        </div>
      );
    }
    const leads = await toLeadViewsForUser(ownLeads, user.id);
    return (
      <div className="space-y-3">
        {statusRow}
        <OwnByDay
          leads={leads}
          viewer={user}
          teamUsers={[]}
          maxPickup={settings.maxPickup}
          reassignTargets={masterReassignTargets}
        />
        <Pager
          page={page}
          shown={ownLeads.length}
          total={ownTotal}
          hrefFor={(n) =>
            tabHref("own", { q, creatorId, sourceId, locationId, page: n, sg: statusGroup, sort })
          }
        />
      </div>
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
            filterWhere,
          ],
        },
        orderBy: leadOrderBy(sort),
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
    const leads = await toLeadViewsForUser(picked, user.id);
    return user.role === "MASTER" ? (
      <PicksByAssignee leads={leads} viewer={user} teamUsers={teamUsers} maxPickup={settings.maxPickup} reassignTargets={masterReassignTargets} />
    ) : (
      <MyPicksByStatus leads={leads} viewer={user} teamUsers={teamUsers} maxPickup={settings.maxPickup} reassignTargets={masterReassignTargets} />
    );
  }

  /* ---------- Single-status tabs ---------- */
  if (tab.key in STATUS_TAB_TO_STATUS) {
    const status = STATUS_TAB_TO_STATUS[tab.key as StatusTabKey];
    const [statusLeads, teamUsers] = await Promise.all([
      prisma.lead.findMany({
        where: {
          AND: [
            { privateChannelUserId: null },
            notInMasterPipeline,
            { status },
            // The "Able" statuses are active work — visible only to the
            // assignee (or master). freshOrMarketVisibility encodes that and
            // is a no-op ({}) for master. Not-Able / Spam / Reject stay
            // visible to everyone.
            freshOrMarketVisibility(user),
            leadSearchFilter(q),
            filterWhere,
          ],
        },
        orderBy: leadOrderBy(sort),
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
    const leads = await toLeadViewsForUser(statusLeads, user.id);
    return <OpenGrouped leads={leads} viewer={user} teamUsers={teamUsers} maxPickup={settings.maxPickup} reassignTargets={masterReassignTargets} />;
  }

  /* ---------- Approved + Recycle Bin tabs — visible to everyone ---------- */
  if (tab.key === "approved" || tab.key === "archive") {
    // Approved deals get their own tab; the Recycle Bin holds recycled ones.
    const wantStatus: LeadStatus = tab.key === "approved" ? "APPROVED" : "RECYCLED";
    const [archivable, teamUsers] = await Promise.all([
      prisma.lead.findMany({
        where: {
          AND: [
            { privateChannelUserId: null },
            { status: wantStatus },
            leadSearchFilter(q),
            filterWhere,
          ],
        },
        orderBy: leadOrderBy(sort),
        take: 200,
        select: leadSelect,
      }),
      // Reassign targets are a master-only affordance in this view.
      user.role === "MASTER"
        ? prisma.user.findMany({
            where: { active: true, role: "USER" },
            select: { id: true, displayName: true },
            orderBy: { displayName: "asc" },
          })
        : Promise.resolve([] as { id: number; displayName: string }[]),
    ]);

    if (archivable.length === 0) {
      return <EmptyState tab={tab.key} hasQuery={!!q} />;
    }
    const leads = await toLeadViewsForUser(archivable, user.id);
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
          notInMasterPipeline,
          dateFilter,
          visibilityFilter,
          leadSearchFilter(q),
          filterWhere,
        ],
      },
      orderBy: leadOrderBy(sort),
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

  const leads = await toLeadViewsForUser(visibleLeads, user.id);
  return <OpenGrouped leads={leads} viewer={user} teamUsers={teamUsers} maxPickup={settings.maxPickup} reassignTargets={masterReassignTargets} flat={tab.key === "market"} />;
}

/* ---------- Shared Prisma select + projection ---------- */

const leadSelect = {
  id: true,
  content: true,
  name: true,
  phone: true,
  source: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
  remark: true,
  status: true,
  quality: true,
  contactState: true,
  createdAt: true,
  updatedAt: true,
  privateChannelUserId: true,
  ackedAt: true,
  ackedBy: { select: { id: true, displayName: true } },
  createdBy: { select: { id: true, displayName: true } },
  assignments: {
    select: { user: { select: { id: true, displayName: true } } },
    orderBy: { assignedAt: "asc" },
  },
} satisfies Prisma.LeadSelect;

type RawLead = {
  id: number;
  content: string;
  name: string | null;
  phone: string | null;
  source: { id: number; name: string } | null;
  location: { id: number; name: string } | null;
  remark: string | null;
  status: LeadStatus;
  quality: LeadQuality | null;
  contactState: string;
  createdAt: Date;
  updatedAt: Date;
  privateChannelUserId: number | null;
  ackedAt: Date | null;
  ackedBy: { id: number; displayName: string } | null;
  createdBy: { id: number; displayName: string };
  assignments: { user: { id: number; displayName: string } }[];
};

function toLeadView(l: RawLead, myReminderAt: Date | null = null): LeadView {
  return {
    id: l.id,
    content: l.content,
    name: l.name,
    phone: l.phone,
    source: l.source,
    location: l.location,
    remark: l.remark,
    status: l.status,
    quality: l.quality,
    contactState: l.contactState,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    privateChannelUserId: l.privateChannelUserId,
    ackedAt: l.ackedAt ? l.ackedAt.toISOString() : null,
    ackedBy: l.ackedBy,
    createdBy: l.createdBy,
    assignees: l.assignments.map((a) => a.user),
    myReminderAt: myReminderAt ? myReminderAt.toISOString() : null,
  };
}

/**
 * Batch-fetch the current user's reminders for a set of leads, return
 * a lookup map. Ponytail: one query per rendered lead list, keyed by leadId.
 */
async function loadMyReminders(
  leadIds: number[],
  userId: number
): Promise<Map<number, Date>> {
  if (leadIds.length === 0) return new Map();
  const rows = await prisma.leadReminder.findMany({
    where: { leadId: { in: leadIds }, userId },
    select: { leadId: true, remindAt: true },
  });
  return new Map(rows.map((r) => [r.leadId, r.remindAt]));
}

/** Attach `myReminderAt` to each lead by looking up the map from loadMyReminders. */
async function toLeadViewsForUser(
  raws: RawLead[],
  userId: number
): Promise<LeadView[]> {
  const map = await loadMyReminders(raws.map((r) => r.id), userId);
  return raws.map((r) => toLeadView(r, map.get(r.id) ?? null));
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
      <Link href="/dashboard?tab=fresh" className="btn btn-outline mt-4 inline-flex">
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
    <div className="space-y-4 md:space-y-6">
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

/* ---------- Tab bar with counts (streamed) ---------- */

async function TabBarWithCounts({
  tab,
  user,
}: {
  tab: DashTab;
  user: CurrentUser;
}) {
  const settings = await getAppSettings();
  const cutoff = ageBoundaryDate();

  // Fire the Own-tab count now so it overlaps the queries below instead of
  // adding another sequential round-trip.
  const ownCountPromise =
    user.role === "MASTER"
      ? prisma.lead.count({ where: { isOwn: true, privateChannelUserId: user.id } })
      : Promise.resolve(0);

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
          notInMasterPipeline,
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
            // Exclude master's Own leads (isOwn=true) so the inbox badge
            // matches its filtered body. No-op for other channels.
            AND: [
              {
                OR: [
                  { privateChannelUserId: u.id },
                  { assignments: { some: { userId: u.id } } },
                ],
              },
              { isOwn: false },
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

  // "General" badge — every private-channel lead (union across channels),
  // matching the General tab body. Master only.
  const generalCount =
    user.role === "MASTER"
      ? await prisma.lead.count({
          where: {
            AND: [
              {
                OR: [
                  { privateChannelUserId: { in: visiblePrivateUsers.map((u) => u.id) } },
                  { assignments: { some: { userId: { in: visiblePrivateUsers.map((u) => u.id) } } } },
                ],
              },
              { isOwn: false },
            ],
          },
        })
      : 0;

  // Master-only "Own" tab badge count. Awaited alongside the batch above
  // rather than after it.
  const ownCount = await ownCountPromise;

  // Only Fresh + Open Market keep live counts in the tab bar now — the
  // status buckets moved to the sidebar (no counts), so their per-status
  // tallies aren't needed here.
  let freshCount = 0;
  let marketCount = 0;

  for (const l of allLeads) {
    const count = l._count.assignments;
    if (ALWAYS_ARCHIVED_STATUSES.includes(l.status)) continue;

    if (user.role !== "MASTER") {
      const mine = (l.assignments as { userId: number }[] | undefined)?.length ?? 0;
      if (mine) continue;
      if (l.status === "NEW") {
        if (count >= settings.maxPickup) continue;
      } else if (ACTIVE_STATUSES.includes(l.status)) {
        continue;
      }
    }

    if (l.createdAt > cutoff) freshCount++;
    else marketCount++;
  }

  return (
    <TabBar
      activeTab={serializeTab(tab)}
      showOwn={user.role === "MASTER"}
      ownCount={ownCount}
      freshCount={freshCount}
      marketCount={marketCount}
      showGeneral={user.role === "MASTER"}
      generalCount={generalCount}
      privateChannels={visiblePrivateUsers.map((u) => ({
        key: privateChannelTabKey(u.id),
        label: u.displayName,
        count: privateCountsMap.get(u.id) ?? 0,
      }))}
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
  flat = false,
}: {
  leads: LeadView[];
  viewer: CurrentUser;
  teamUsers: { id: number; displayName: string }[];
  maxPickup: number;
  reassignTargets?: { id: number; displayName: string }[];
  /** Skip the per-creator grouping and render one flat grid (Open Market). */
  flat?: boolean;
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

  // Flat mode (Open Market): one grid, no per-creator sections.
  if (flat) {
    return (
      <ul className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {visibleLeads.map((lead) => (
          <li key={lead.id}>
            <LeadCard lead={lead} viewer={viewer} teamUsers={teamUsers} maxPickup={maxPickup} reassignTargets={reassignTargets} />
          </li>
        ))}
      </ul>
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
    <div className="space-y-4 md:space-y-6">
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

/**
 * "Own" tab renderer: master's private leads grouped by the day they were
 * created (Today / Yesterday / explicit date), newest day first. Each day
 * is a collapsible section; the most recent day starts open.
 */
function OwnByDay({
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
  const dayKey = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  };
  const dayLabel = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const sameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
    if (sameDay(d, today)) return "Today";
    if (sameDay(d, yesterday)) return "Yesterday";
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  // Leads arrive newest-first, so day buckets keep that order.
  const buckets = new Map<string, { label: string; items: LeadView[] }>();
  for (const lead of leads) {
    const key = dayKey(lead.createdAt);
    const bucket = buckets.get(key) ?? { label: dayLabel(lead.createdAt), items: [] };
    bucket.items.push(lead);
    buckets.set(key, bucket);
  }
  const entries = Array.from(buckets.entries()).sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <div className="space-y-4 md:space-y-6">
      {entries.map(([key, bucket], idx) => (
        <CollapsibleSection
          key={key}
          storageKey={`own:by-day:${key}`}
          count={bucket.items.length}
          defaultOpen={idx === 0}
          header={
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-brand-700">
                <Lock className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-ink-900">{bucket.label}</h3>
                <p className="text-xs text-ink-500">
                  {bucket.items.length} lead{bucket.items.length === 1 ? "" : "s"}
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
    <div className="space-y-4 md:space-y-6">
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
    <div className="space-y-4 md:space-y-6">
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
                      RECYCLED: "Recycle Bin",
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
    <div className="space-y-4 md:space-y-6">
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
    : tab === "own"
      ? "Your list is empty"
      : tab === "fresh"
        ? "No leads to show"
        : tab === "market"
          ? "Open Market is empty"
          : tab === "picks"
            ? "Nothing picked up yet"
            : tab === "approved"
              ? "No approved leads yet"
              : tab === "general"
                ? "No private-channel leads yet"
                : tab === "archive"
                  ? "Recycle Bin is empty"
                  : "No leads with this status yet";
  const body = hasQuery
    ? "Try a different search term."
    : tab === "own"
      ? "Paste a lead above — it lands in your private list with a 1-hour follow-up reminder."
      : tab === "fresh"
        ? "Paste a new lead above, or wait for a teammate to drop one in."
        : tab === "market"
          ? "Closed leads will appear here once the team starts moving them out of New."
          : tab === "picks"
            ? "Pick up a lead from Fresh or Open Market and it'll show up here."
            : tab === "approved"
              ? "Leads marked Approved land here for everyone to see."
              : tab === "general"
                ? "Leads across every private channel appear here."
                : tab === "archive"
                  ? "Leads moved to the Recycle Bin land here."
                  : "Leads set to this status will land here.";
  return (
    <div className="card p-12 text-center">
      <div className="mx-auto h-12 w-12 rounded-full bg-ink-100 grid place-items-center text-ink-400">
        ✦
      </div>
      <h3 className="mt-4 text-base font-semibold text-ink-900">{title}</h3>
      <p className="mt-1 text-sm text-ink-500">{body}</p>
      {tab !== "fresh" && !hasQuery && (
        <Link href="/dashboard?tab=fresh" className="btn btn-outline mt-4 inline-flex">
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
