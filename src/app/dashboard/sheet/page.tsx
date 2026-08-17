import Link from "next/link";
import { Download } from "lucide-react";
import type { Prisma, LeadStatus } from "@prisma/client";
import { requireMaster } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { STATUS_LABEL } from "@/lib/leadStatus";
import {
  parseIds,
  parseAge,
  parseSort,
  leadOrderBy,
  leadFilterWhere,
} from "@/lib/leadFilters";
import { LeadFilterBar } from "@/components/LeadFilterBar";
import { LeadSheet, type SheetRow } from "@/components/LeadSheet";

export const dynamic = "force-dynamic";

const SHEET_PAGE_SIZE = 100;

type Search = { q?: string; fu?: string; fs?: string; fl?: string; age?: string; sort?: string; p?: string; st?: string; ch?: string; nos?: string };

/** Header Status filter (`?st=`): a single LeadStatus, or nothing = all. */
function parseStatus(raw: string | undefined): LeadStatus | null {
  return raw && raw in STATUS_LABEL ? (raw as LeadStatus) : null;
}

/** Header "Under" filter (`?ch=`): where the lead sits.
 *  "public" = shared pool, "own" = master's Own list, "<userId>" = that user's channel. */
function placementWhere(ch: string | undefined): Prisma.LeadWhereInput {
  if (ch === "public") return { privateChannelUserId: null };
  if (ch === "own") return { isOwn: true };
  const id = Number(ch);
  if (Number.isFinite(id) && id > 0) return { privateChannelUserId: id, isOwn: false };
  return {};
}

function searchFilter(q: string): Prisma.LeadWhereInput {
  if (!q) return {};
  return {
    OR: [
      { name: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { content: { contains: q, mode: "insensitive" } },
      { remark: { contains: q, mode: "insensitive" } },
    ],
  };
}

function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 1 ? Math.floor(n) : 1;
}

function pageHref(sp: Search, p: number): string {
  const q = new URLSearchParams();
  if (sp.q) q.set("q", sp.q);
  if (sp.fu) q.set("fu", sp.fu);
  if (sp.fs) q.set("fs", sp.fs);
  if (sp.fl) q.set("fl", sp.fl);
  if (sp.age) q.set("age", sp.age);
  if (sp.sort) q.set("sort", sp.sort);
  if (sp.st) q.set("st", sp.st);
  if (sp.ch) q.set("ch", sp.ch);
  if (sp.nos) q.set("nos", sp.nos);
  if (p > 1) q.set("p", String(p));
  const s = q.toString();
  return s ? `/dashboard/sheet?${s}` : "/dashboard/sheet";
}

/** Export link carries the active filters (all pages, no `p`). */
function exportHref(sp: Search): string {
  const q = new URLSearchParams();
  for (const k of ["q", "fu", "fs", "fl", "age", "sort", "st", "ch", "nos"] as const) {
    if (sp[k]) q.set(k, sp[k] as string);
  }
  const s = q.toString();
  return s ? `/dashboard/sheet/export?${s}` : "/dashboard/sheet/export";
}

export default async function SheetPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireMaster();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const creatorIds = parseIds(sp.fu);
  const sourceIds = parseIds(sp.fs);
  const locationIds = parseIds(sp.fl);
  const age = parseAge(sp.age);
  const sort = parseSort(sp.sort);
  const page = parsePage(sp.p);
  const status = parseStatus(sp.st);
  const under = sp.ch ?? "";
  const noSource = sp.nos === "1";

  const where: Prisma.LeadWhereInput = {
    AND: [
      leadFilterWhere(creatorIds, sourceIds, locationIds, age),
      searchFilter(q),
      status ? { status } : {},
      placementWhere(under || undefined),
      noSource ? { sourceId: null } : {},
    ],
  };

  const [leads, total, users, sources, locations] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: leadOrderBy(sort),
      skip: (page - 1) * SHEET_PAGE_SIZE,
      take: SHEET_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        phone: true,
        status: true,
        sourceId: true,
        locationId: true,
        isOwn: true,
        privateChannelUserId: true,
        privateChannelUser: { select: { displayName: true } },
      },
    }),
    prisma.lead.count({ where }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }),
    prisma.leadSource.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.leadLocation.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const rows: SheetRow[] = leads.map((l) => ({
    id: l.id,
    name: l.name,
    phone: l.phone,
    status: l.status,
    sourceId: l.sourceId,
    locationId: l.locationId,
    placement: l.isOwn ? "Own" : l.privateChannelUser?.displayName ?? "Public",
  }));

  const first = (page - 1) * SHEET_PAGE_SIZE + 1;
  const last = first + rows.length - 1;
  const hasPrev = page > 1;
  const hasNext = last < total;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-ink-900">Bulk Edit</h1>
          <p className="text-xs text-ink-500">Edit a cell — it saves to the lead automatically.</p>
        </div>
        <a
          href={exportHref(sp)}
          className="btn btn-outline h-9 shrink-0 gap-1.5 text-xs"
          title="Download the filtered leads as a CSV (opens in Excel)"
        >
          <Download className="h-4 w-4" />
          Export
        </a>
      </div>

      <form action="/dashboard/sheet" className="relative w-full">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search name, phone, content…"
          className="input w-full pr-24 h-11 text-sm"
          aria-label="Search leads"
        />
        <button
          type="submit"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-9 items-center rounded-md bg-brand-600 px-3 text-xs font-semibold text-white hover:bg-brand-700"
        >
          Search
        </button>
      </form>

      <LeadFilterBar
        users={users}
        sources={sources}
        locations={locations}
        creatorIds={creatorIds}
        sourceIds={sourceIds}
        locationIds={locationIds}
        age={age}
        sort={sort}
      />

      <LeadSheet
        rows={rows}
        sources={sources}
        locations={locations}
        users={users}
        filters={{
          status: status ?? "",
          source: noSource ? "none" : sourceIds.length === 1 ? String(sourceIds[0]) : "",
          location: locationIds.length === 1 ? String(locationIds[0]) : "",
          under,
        }}
      />

      {(hasPrev || hasNext) && (
        <div className="card flex items-center justify-between gap-2 p-2.5">
          {hasPrev ? (
            <Link href={pageHref(sp, page - 1)} className="inline-flex h-8 items-center rounded-lg px-3 text-[11px] font-medium text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50">← Newer</Link>
          ) : (
            <span className="inline-flex h-8 items-center rounded-lg px-3 text-[11px] font-medium text-ink-300">← Newer</span>
          )}
          <span className="text-[11px] text-ink-600 tabular-nums">{first}–{last} of {total}</span>
          {hasNext ? (
            <Link href={pageHref(sp, page + 1)} className="inline-flex h-8 items-center rounded-lg px-3 text-[11px] font-medium text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50">Older →</Link>
          ) : (
            <span className="inline-flex h-8 items-center rounded-lg px-3 text-[11px] font-medium text-ink-300">Older →</span>
          )}
        </div>
      )}
    </div>
  );
}
