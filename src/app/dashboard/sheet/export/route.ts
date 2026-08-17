import type { NextRequest } from "next/server";
import type { Prisma, LeadStatus } from "@prisma/client";
import { requireMaster } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { STATUS_LABEL } from "@/lib/leadStatus";
import { parseIds, parseAge, parseSort, leadOrderBy, leadFilterWhere } from "@/lib/leadFilters";

export const dynamic = "force-dynamic";

// Hard cap so a broad export can't stream the whole table unbounded.
const EXPORT_LIMIT = 10_000;

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

function placementWhere(ch: string | undefined): Prisma.LeadWhereInput {
  if (ch === "public") return { privateChannelUserId: null };
  if (ch === "own") return { isOwn: true };
  const id = Number(ch);
  if (Number.isFinite(id) && id > 0) return { privateChannelUserId: id, isOwn: false };
  return {};
}

/** Escape one CSV field: wrap in quotes and double any embedded quotes. */
function csv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  await requireMaster();
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const status = sp.get("st");
  const ch = sp.get("ch") ?? undefined;

  const where: Prisma.LeadWhereInput = {
    AND: [
      leadFilterWhere(parseIds(sp.get("fu") ?? undefined), parseIds(sp.get("fs") ?? undefined), parseIds(sp.get("fl") ?? undefined), parseAge(sp.get("age") ?? undefined)),
      searchFilter(q),
      status && status in STATUS_LABEL ? { status: status as LeadStatus } : {},
      placementWhere(ch || undefined),
      sp.get("nos") === "1" ? { sourceId: null } : {},
    ],
  };

  const leads = await prisma.lead.findMany({
    where,
    orderBy: leadOrderBy(parseSort(sp.get("sort") ?? undefined)),
    take: EXPORT_LIMIT,
    select: {
      id: true,
      name: true,
      phone: true,
      ic: true,
      status: true,
      isOwn: true,
      createdAt: true,
      source: { select: { name: true } },
      location: { select: { name: true } },
      privateChannelUser: { select: { displayName: true } },
    },
  });

  const header = ["ID", "Name", "Phone", "IC", "Status", "Source", "Location", "Under", "Created"];
  const lines = [header.map(csv).join(",")];
  for (const l of leads) {
    lines.push(
      [
        String(l.id),
        l.name ?? "",
        l.phone ?? "",
        l.ic ?? "",
        STATUS_LABEL[l.status],
        l.source?.name ?? "",
        l.location?.name ?? "",
        l.isOwn ? "Own" : l.privateChannelUser?.displayName ?? "Public",
        l.createdAt.toISOString().slice(0, 10),
      ]
        .map(csv)
        .join(",")
    );
  }
  // Leading BOM so Excel reads it as UTF-8 (keeps non-ASCII names intact).
  const body = "﻿" + lines.join("\r\n");
  const filename = `leadboard-export-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
