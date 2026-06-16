import type { LeadStatus } from "@prisma/client";
import { requireMaster } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";
import { CreateUserForm } from "@/components/CreateUserForm";
import { UserRow } from "@/components/UserRow";
import { MaxPickupCard } from "@/components/MaxPickupCard";
import { TeamStatsTable, type UserStatsRow } from "@/components/TeamStatsTable";
import { MasterProfileCard } from "@/components/MasterProfileCard";
import { CollapsibleSection } from "@/components/CollapsibleSection";

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

  const [users, pendingResets, settings, statusChangeRows, masterProfile] = await Promise.all([
    prisma.user.findMany({
      where: { role: "USER" },
      orderBy: [{ active: "desc" }, { displayName: "asc" }],
      include: {
        _count: {
          select: {
            createdLeads: true,
            assignments: true,
            pushSubscriptions: true,
          },
        },
      },
    }),
    prisma.passwordResetRequest.count({ where: { resolvedAt: null } }),
    getAppSettings(),
    // Cumulative status-change activity per user. Each row in
    // LeadStatusChange is one transition; grouping by (changedById, toStatus)
    // and counting gives "how many times this user has set a lead to this
    // status" — never decrements when the lead later moves on.
    prisma.leadStatusChange.groupBy({
      by: ["changedById", "toStatus"],
      _count: { _all: true },
    }),
    prisma.user.findUnique({
      where: { id: master.id },
      select: { id: true, username: true, displayName: true },
    }),
  ]);

  // Aggregate transitions per user by destination status.
  const changeCountsByUser = new Map<number, Record<LeadStatus, number>>();
  for (const row of statusChangeRows) {
    const bucket = changeCountsByUser.get(row.changedById) ?? emptyStatusCounts();
    bucket[row.toStatus] += row._count._all;
    changeCountsByUser.set(row.changedById, bucket);
  }

  const statsRows: UserStatsRow[] = users.map((u) => {
    const changeCounts = changeCountsByUser.get(u.id) ?? emptyStatusCounts();
    const totalChanges = Object.values(changeCounts).reduce((a, b) => a + b, 0);
    return {
      userId: u.id,
      displayName: u.displayName,
      username: u.username,
      active: u.active,
      changeCounts,
      totalChanges,
      pickUpsCount: u.pickUpsCount,
      dropsCount: u.dropsCount,
      pushDevices: u._count.pushSubscriptions,
      createdLeads: u._count.createdLeads,
    };
  });

  return (
    <div className="space-y-5 md:space-y-8 max-w-5xl">
      <div>
        <h2 className="text-2xl md:text-3xl font-semibold text-ink-900 tracking-tight">Team</h2>
        <p className="text-ink-500 mt-1 text-xs md:text-sm">
          Manage user accounts, configure pickup rules, and review team activity.
        </p>
      </div>

      {pendingResets > 0 && (
        <div className="card p-3 md:p-4 border-amber-200 bg-amber-50/70 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm">
            <strong className="text-amber-900">{pendingResets}</strong>{" "}
            <span className="text-amber-800">pending password reset {pendingResets === 1 ? "request" : "requests"}.</span>
          </div>
          <a href="/dashboard/admin/resets" className="btn btn-outline h-9 text-xs">
            Review
          </a>
        </div>
      )}

      {masterProfile && (
        <CollapsibleSection
          storageKey="team:profile"
          defaultOpen={false}
          header={<TeamHeader title="My profile" subtitle="Edit your master account details." />}
        >
          <MasterProfileCard master={masterProfile} />
        </CollapsibleSection>
      )}

      <CollapsibleSection
        storageKey="team:max-pickup"
        defaultOpen={false}
        header={<TeamHeader title="Pickup capacity" subtitle="How many people can pick up a single lead." />}
      >
        <MaxPickupCard current={settings.maxPickup} />
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="team:activity"
        defaultOpen={false}
        header={
          <TeamHeader
            title="Activity by user"
            subtitle="Cumulative status changes, pickups, and drops per user."
          />
        }
      >
        <TeamStatsTable rows={statsRows} />
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="team:add-user"
        defaultOpen={false}
        header={
          <TeamHeader
            title="Add a new user"
            subtitle="They can sign in immediately with the password you set."
          />
        }
      >
        <section className="card p-4 md:p-6">
          <CreateUserForm />
        </section>
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="team:users"
        defaultOpen={false}
        count={users.length}
        header={<TeamHeader title="Users" subtitle="Edit, disable, or delete team members." />}
      >
        <section className="card overflow-hidden">
          {users.length === 0 ? (
            <div className="p-10 text-center text-sm text-ink-500">
              No users yet — add your first teammate above.
            </div>
          ) : (
            <ul className="divide-y divide-ink-100">
              {users.map((u) => (
                <UserRow
                  key={u.id}
                  user={{
                    id: u.id,
                    username: u.username,
                    displayName: u.displayName,
                    active: u.active,
                    isPrivateChannel: u.isPrivateChannel,
                  }}
                />
              ))}
            </ul>
          )}
        </section>
      </CollapsibleSection>
    </div>
  );
}

function TeamHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
      <p className="text-xs text-ink-500 mt-0.5">{subtitle}</p>
    </div>
  );
}
