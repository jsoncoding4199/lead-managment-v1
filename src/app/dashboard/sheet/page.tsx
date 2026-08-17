import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireMaster } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

type Search = { q?: string; fu?: string; fs?: string; fl?: string; age?: string; sort?: string; p?: string };

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
  if (p > 1) q.set("p", String(p));
  const s = q.toString();
  return s ? `/dashboard/sheet?${s}` : "/dashboard/sheet";
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

  const where: Prisma.LeadWhereInput = {
    AND: [leadFilterWhere(creatorIds, sourceIds, locationIds, age), searchFilter(q)],
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
        createdBy: { select: { displayName: true } },
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
    createdBy: l.createdBy.displayName,
  }));

  const first = (page - 1) * SHEET_PAGE_SIZE + 1;
  const last = first + rows.length - 1;
  const hasPrev = page > 1;
  const hasNext = last < total;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold text-ink-900">Bulk Edit</h1>
        <p className="text-xs text-ink-500">Edit a cell — it saves to the lead automatically.</p>
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

      {rows.length === 0 ? (
        <div className="card p-10 text-center text-sm text-ink-500">No leads match.</div>
      ) : (
        <LeadSheet rows={rows} sources={sources} locations={locations} />
      )}

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
