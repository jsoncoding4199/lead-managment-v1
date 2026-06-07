import { requireMaster } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import { ResetRow } from "@/components/ResetRow";

export default async function ResetsPage() {
  await requireMaster();

  const requests = await prisma.passwordResetRequest.findMany({
    orderBy: [{ resolvedAt: "asc" }, { createdAt: "desc" }],
    include: {
      user: { select: { id: true, username: true, displayName: true } },
      resolvedBy: { select: { displayName: true } },
    },
    take: 100,
  });

  const pending = requests.filter((r) => !r.resolvedAt);
  const resolved = requests.filter((r) => r.resolvedAt);

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h2 className="text-3xl font-semibold text-ink-900 tracking-tight">Reset requests</h2>
        <p className="text-ink-500 mt-1 text-sm">Users who forgot their passwords have asked for a reset.</p>
      </div>

      <section className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-ink-200/70">
          <h3 className="text-sm font-semibold text-ink-900">Pending ({pending.length})</h3>
        </div>
        {pending.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-500">No pending requests.</div>
        ) : (
          <ul className="divide-y divide-ink-100">
            {pending.map((r) => (
              <ResetRow
                key={r.id}
                request={{
                  id: r.id,
                  userId: r.user.id,
                  displayName: r.user.displayName,
                  username: r.user.username,
                  createdAt: r.createdAt.toISOString(),
                }}
              />
            ))}
          </ul>
        )}
      </section>

      {resolved.length > 0 && (
        <section className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-ink-200/70">
            <h3 className="text-sm font-semibold text-ink-900">Resolved</h3>
          </div>
          <ul className="divide-y divide-ink-100">
            {resolved.map((r) => (
              <li key={r.id} className="px-6 py-3 flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium text-ink-800">{r.user.displayName}</div>
                  <div className="text-xs text-ink-500">@{r.user.username}</div>
                </div>
                <div className="text-xs text-ink-500 text-right">
                  Resolved by {r.resolvedBy?.displayName ?? "—"}
                  <div>{r.resolvedAt ? formatDateTime(r.resolvedAt) : ""}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
