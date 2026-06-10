import type { LeadStatus } from "@prisma/client";
import { requireMaster } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";
import { CreateUserForm } from "@/components/CreateUserForm";
import { UserRow } from "@/components/UserRow";
import { MaxPickupCard } from "@/components/MaxPickupCard";
import { TeamStatsTable, type UserStatsRow } from "@/components/TeamStatsTable";
import { MasterProfileCard } from "@/components/MasterProfileCard";

function emptyStatusCounts(): Record<LeadStatus, number> {
  return {
    NEW: 0,
    CONTACT_ABLE: 0,
    CONTACT_NOT_ABLE: 0,
    DOCUMENTS_ABLE: 0,
    DOCUMENTS_NOT_ABLE: 0,
    APPOINTMENT_ABLE: 0,
    APPOINTMENT_NOT_ABLE: 0,
    SPAM_OR_MISSING: 0,
    REJECTED: 0,
    APPROVED: 0,
  };
}

export default async function AdminPage() {
  const master = await requireMaster();

  const [users, pendingResets, settings, assignmentRows, masterProfile] = await Promise.all([
    prisma.user.findMany({
      where: { role: "USER" },
      orderBy: [{ active: "desc" }, { displayName: "asc" }],
      include: {
        _count: { select: { createdLeads: true, assignments: true } },
      },
    }),
    prisma.passwordResetRequest.count({ where: { resolvedAt: null } }),
    getAppSettings(),
    prisma.leadAssignment.findMany({
      where: { user: { role: "USER" } },
      select: {
        userId: true,
        lead: { select: { status: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: master.id },
      select: { id: true, username: true, displayName: true },
    }),
  ]);

  // Aggregate assignments per user by status.
  const statsByUser = new Map<number, Record<LeadStatus, number>>();
  for (const a of assignmentRows) {
    const bucket = statsByUser.get(a.userId) ?? emptyStatusCounts();
    bucket[a.lead.status] += 1;
    statsByUser.set(a.userId, bucket);
  }

  const statsRows: UserStatsRow[] = users.map((u) => {
    const counts = statsByUser.get(u.id) ?? emptyStatusCounts();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return {
      userId: u.id,
      displayName: u.displayName,
      username: u.username,
      active: u.active,
      counts,
      total,
    };
  });

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h2 className="text-3xl font-semibold text-ink-900 tracking-tight">Team</h2>
        <p className="text-ink-500 mt-1 text-sm">
          Create user accounts, disable people who shouldn&apos;t have access, reset
          passwords on demand, and configure team-wide pickup rules.
        </p>
      </div>

      {pendingResets > 0 && (
        <div className="card p-4 border-amber-200 bg-amber-50/70 flex items-center justify-between">
          <div className="text-sm">
            <strong className="text-amber-900">{pendingResets}</strong>{" "}
            <span className="text-amber-800">pending password reset {pendingResets === 1 ? "request" : "requests"}.</span>
          </div>
          <a href="/dashboard/admin/resets" className="btn btn-outline h-8 text-xs">
            Review
          </a>
        </div>
      )}

      {masterProfile && <MasterProfileCard master={masterProfile} />}

      <MaxPickupCard current={settings.maxPickup} />

      <TeamStatsTable rows={statsRows} />

      <section className="card p-6">
        <h3 className="text-sm font-semibold text-ink-900">Add a new user</h3>
        <p className="text-xs text-ink-500 mt-0.5">They can sign in immediately with the password you set.</p>
        <div className="mt-4">
          <CreateUserForm />
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-ink-200/70 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-900">Users ({users.length})</h3>
        </div>
        {users.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-500">No users yet — add your first teammate above.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-ink-500 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left font-semibold px-6 py-3">User</th>
                <th className="text-left font-semibold px-6 py-3">Status</th>
                <th className="text-left font-semibold px-6 py-3">Created</th>
                <th className="text-left font-semibold px-6 py-3">Picked up</th>
                <th className="text-right font-semibold px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {users.map((u) => (
                <UserRow
                  key={u.id}
                  user={{
                    id: u.id,
                    username: u.username,
                    displayName: u.displayName,
                    active: u.active,
                    createdLeads: u._count.createdLeads,
                    assignedLeads: u._count.assignments,
                  }}
                />
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
