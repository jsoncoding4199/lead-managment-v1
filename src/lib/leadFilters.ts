import type { Prisma } from "@prisma/client";

/**
 * Shared lead filter/sort helpers for every list surface (the dashboard
 * pipelines and the Bulk Edit sheet). Kept in one place so a filter added to
 * the pipelines behaves identically in the sheet.
 */

/** Lead-aging buckets (days since createdAt), filtered via `?age=`. */
export const AGE_BUCKETS = {
  "1_14": { label: "1–14 days", min: 1, max: 14 },
  "15_29": { label: "15–29 days", min: 15, max: 29 },
  "30_59": { label: "30–59 days", min: 30, max: 59 },
  "60_89": { label: "60–89 days", min: 60, max: 89 },
  "90_up": { label: "90+ days", min: 90, max: null },
} satisfies Record<string, { label: string; min: number; max: number | null }>;
export type AgeKey = keyof typeof AGE_BUCKETS;

export function parseAge(raw: string | undefined): AgeKey | null {
  return raw && raw in AGE_BUCKETS ? (raw as AgeKey) : null;
}

/** createdAt range for an aging bucket. age N days ⟺ createdAt N days ago. */
export function leadAgeWhere(age: AgeKey | null): Prisma.LeadWhereInput {
  if (!age) return {};
  const { min, max } = AGE_BUCKETS[age];
  const day = 86_400_000;
  const now = Date.now();
  const createdAt: Prisma.DateTimeFilter = { lte: new Date(now - min * day) };
  if (max !== null) createdAt.gte = new Date(now - (max + 1) * day);
  return { createdAt };
}

/** Date sort for every pipeline list. "new" = newest first (default),
 *  "old" = oldest first (longest-waiting / most days). */
export type SortKey = "new" | "old";
export function parseSort(raw: string | undefined): SortKey {
  return raw === "old" ? "old" : "new";
}
export function leadOrderBy(sort: SortKey): Prisma.LeadOrderByWithRelationInput[] {
  return [{ createdAt: sort === "old" ? "asc" : "desc" }];
}

/**
 * Cross-tab filter clause: narrow leads to a specific creator (fu), lead
 * source (fs) and/or location (fl), plus an aging bucket. All optional;
 * returns {} when none are set so it's a no-op alongside the other AND filters.
 */
export function leadFilterWhere(
  creatorIds: number[],
  sourceIds: number[],
  locationIds: number[],
  age: AgeKey | null = null
): Prisma.LeadWhereInput {
  const and: Prisma.LeadWhereInput[] = [];
  if (creatorIds.length) and.push({ createdById: { in: creatorIds } });
  if (sourceIds.length) and.push({ sourceId: { in: sourceIds } });
  if (locationIds.length) and.push({ locationId: { in: locationIds } });
  const ageWhere = leadAgeWhere(age);
  if (ageWhere.createdAt) and.push(ageWhere);
  return and.length ? { AND: and } : {};
}

/** "1,3,5" → [1,3,5]; drops blanks/non-positives. Used for the multi-select
 *  filters whose fu/fs/fl params hold a comma-separated id list. */
export function parseIds(raw: string | undefined): number[] {
  return (raw ?? "")
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
}
