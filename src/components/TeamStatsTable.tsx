import type { LeadStatus } from "@prisma/client";
import { BellOff, BellRing, Hand, FilePlus } from "lucide-react";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/leadStatus";
import { cn } from "@/lib/utils";

const ORDER: LeadStatus[] = [
  "NEW",
  "CONTACT_ABLE",
  "CONTACT_NOT_ABLE",
  "DOCUMENTS_ABLE",
  "DOCUMENTS_NOT_ABLE",
  "APPOINTMENT_ABLE",
  "APPOINTMENT_NOT_ABLE",
  "SPAM_OR_MISSING",
  "REJECTED",
  "APPROVED",
];

export type UserStatsRow = {
  userId: number;
  displayName: string;
  username: string;
  active: boolean;
  changeCounts: Record<LeadStatus, number>;
  totalChanges: number;
  pickUpsCount: number;
  pushDevices: number;
  createdLeads: number;
};

/**
 * Stats laid out with USERS as columns and METRICS as rows. The left
 * column (metric label) is sticky so it stays visible while the user
 * scrolls horizontally on a phone. Designed mobile-first — narrow user
 * columns (88px) so 3 fit on a 360px screen without scrolling.
 */
export function TeamStatsTable({ rows }: { rows: UserStatsRow[] }) {
  return (
    <section className="card overflow-hidden">
      <div className="px-4 md:px-6 py-3 md:py-4 border-b border-ink-200/70">
        <h3 className="text-sm font-semibold text-ink-900">Activity by user</h3>
        <p className="text-xs text-ink-500 mt-0.5">
          Cumulative — values never decrement when a lead moves on. Swipe sideways to see more users.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="p-10 text-center text-sm text-ink-500">
          No active users to summarize yet.
        </div>
      ) : (
        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="bg-ink-50 text-ink-500 text-[10px] uppercase tracking-wider">
              <tr>
                <th
                  className="text-left font-semibold px-3 py-3 sticky left-0 bg-ink-50 z-10 border-b border-ink-200/70 min-w-[7.5rem]"
                >
                  Metric
                </th>
                {rows.map((r) => (
                  <th
                    key={r.userId}
                    className={cn(
                      "text-center font-semibold px-2 py-3 border-b border-ink-200/70 whitespace-nowrap min-w-[5.5rem]",
                      !r.active && "opacity-60"
                    )}
                    title={`@${r.username}`}
                  >
                    <div className="font-semibold text-ink-800 normal-case text-[11px] truncate max-w-[6rem]">
                      {r.displayName}
                    </div>
                    <div className="text-[9px] text-ink-400 normal-case truncate max-w-[6rem]">
                      @{r.username}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              <MetricRow label="Push" rows={rows}>
                {(r) =>
                  r.pushDevices > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                      <BellRing className="h-3 w-3" />
                      {r.pushDevices}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200">
                      <BellOff className="h-3 w-3" />
                      Off
                    </span>
                  )
                }
              </MetricRow>
              <MetricRow label="Created" rows={rows}>
                {(r) =>
                  r.createdLeads === 0 ? (
                    <Dash />
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-200">
                      <FilePlus className="h-3 w-3" />
                      {r.createdLeads}
                    </span>
                  )
                }
              </MetricRow>
              <MetricRow label="Total changes" rows={rows}>
                {(r) => (
                  <span className="inline-flex items-center rounded-full bg-ink-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                    {r.totalChanges}
                  </span>
                )}
              </MetricRow>
              <MetricRow label="Picked up" rows={rows}>
                {(r) =>
                  r.pickUpsCount === 0 ? (
                    <Dash />
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 ring-1 ring-brand-200">
                      <Hand className="h-3 w-3" />
                      {r.pickUpsCount}
                    </span>
                  )
                }
              </MetricRow>
              {ORDER.map((s) => (
                <MetricRow key={s} label={STATUS_LABEL[s]} rows={rows}>
                  {(r) => {
                    const n = r.changeCounts[s] ?? 0;
                    return n === 0 ? (
                      <Dash />
                    ) : (
                      <span
                        className={cn(
                          "inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 min-w-[1.75rem]",
                          STATUS_TONE[s]
                        )}
                      >
                        {n}
                      </span>
                    );
                  }}
                </MetricRow>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function MetricRow({
  label,
  rows,
  children,
}: {
  label: string;
  rows: UserStatsRow[];
  children: (row: UserStatsRow) => React.ReactNode;
}) {
  return (
    <tr>
      <th
        scope="row"
        className="text-left text-xs font-semibold text-ink-700 px-3 py-3 sticky left-0 bg-white z-10 whitespace-nowrap"
      >
        {label}
      </th>
      {rows.map((r) => (
        <td
          key={r.userId}
          className={cn(
            "px-2 py-3 text-center",
            !r.active && "opacity-60"
          )}
        >
          {children(r)}
        </td>
      ))}
    </tr>
  );
}

function Dash() {
  return <span className="text-[11px] text-ink-300">—</span>;
}
