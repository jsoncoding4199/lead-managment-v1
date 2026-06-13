import type { LeadStatus } from "@prisma/client";
import { BellOff, BellRing } from "lucide-react";
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
  total: number;
  counts: Record<LeadStatus, number>;
  /** Number of active Web Push subscriptions across this user's devices. */
  pushDevices: number;
};

export function TeamStatsTable({ rows }: { rows: UserStatsRow[] }) {
  return (
    <section className="card overflow-hidden">
      <div className="px-6 py-4 border-b border-ink-200/70 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink-900">Lead breakdown by user</h3>
          <p className="text-xs text-ink-500 mt-0.5">
            How many leads each active user has picked up, sliced by current status.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="p-10 text-center text-sm text-ink-500">No active users to summarize yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-ink-500 text-[10px] uppercase tracking-wider">
              <tr>
                <th className="text-left font-semibold px-6 py-3 sticky left-0 bg-ink-50">User</th>
                <th className="text-center font-semibold px-3 py-3 whitespace-nowrap">Push</th>
                <th className="text-right font-semibold px-3 py-3">Total</th>
                {ORDER.map((s) => (
                  <th key={s} className="text-right font-semibold px-3 py-3 whitespace-nowrap">
                    {STATUS_LABEL[s]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((row) => (
                <tr key={row.userId} className={!row.active ? "bg-ink-50/60" : ""}>
                  <td className="px-6 py-3 sticky left-0 bg-white">
                    <div className="font-medium text-ink-900">{row.displayName}</div>
                    <div className="text-xs text-ink-500">@{row.username}</div>
                  </td>
                  <td className="px-3 py-3 text-center" title={
                    row.pushDevices > 0
                      ? `${row.pushDevices} device${row.pushDevices === 1 ? "" : "s"} subscribed`
                      : "User hasn't enabled push notifications"
                  }>
                    {row.pushDevices > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                        <BellRing className="h-3 w-3" />
                        {row.pushDevices}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200">
                        <BellOff className="h-3 w-3" />
                        Off
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className="inline-flex items-center rounded-full bg-ink-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                      {row.total}
                    </span>
                  </td>
                  {ORDER.map((s) => {
                    const n = row.counts[s] ?? 0;
                    return (
                      <td key={s} className="px-3 py-3 text-right">
                        {n === 0 ? (
                          <span className="text-[11px] text-ink-300">—</span>
                        ) : (
                          <span
                            className={cn(
                              "inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 min-w-[1.75rem]",
                              STATUS_TONE[s]
                            )}
                          >
                            {n}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
