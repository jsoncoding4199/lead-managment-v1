import type { LeadChannel } from "@prisma/client";
import type { CurrentUser } from "./auth";

export type ChannelKey = "AHA" | "AHB";

// Private channel "owners". The named user gets access alongside master;
// everyone else can't see the tab or its leads. Matching is case-insensitive
// and accepts either displayName or username so the user can be created
// either way without breaking visibility.
export const CHANNEL_OWNERS: Record<ChannelKey, string> = {
  AHA: "AHA Adam",
  AHB: "AHB Eddie",
};

export const CHANNEL_LABEL: Record<ChannelKey, string> = {
  AHA: "AHA",
  AHB: "AHB",
};

export const CHANNEL_KEYS: ChannelKey[] = ["AHA", "AHB"];

function matchesOwner(user: Pick<CurrentUser, "displayName" | "username">, owner: string): boolean {
  const o = owner.trim().toLowerCase();
  return (
    user.displayName.trim().toLowerCase() === o ||
    user.username.trim().toLowerCase() === o
  );
}

export function canSeeChannel(user: CurrentUser, channel: ChannelKey): boolean {
  if (user.role === "MASTER") return true;
  return matchesOwner(user, CHANNEL_OWNERS[channel]);
}

export function visibleChannels(user: CurrentUser): ChannelKey[] {
  return CHANNEL_KEYS.filter((k) => canSeeChannel(user, k));
}

// "Default" channel = the regular pipeline (Fresh/Market/Picks/Archive).
// Used everywhere those tabs query leads so private-channel leads stay
// segregated.
export const DEFAULT_CHANNEL: LeadChannel = "DEFAULT";

/**
 * Authoritative read-access check for a lead based on its channel.
 *
 *   - DEFAULT      → everyone may view (subject to status/assignment rules
 *                    enforced elsewhere)
 *   - AHA / AHB    → only the channel owner (matched by displayName or
 *                    username) and master
 *
 * Use this as the *only* check that says "can this user see this lead's
 * channel" — keeps the rule in one place so we can't forget to mirror it
 * in a future query.
 */
export function canAccessLeadChannel(user: CurrentUser, channel: LeadChannel): boolean {
  if (channel === "DEFAULT") return true;
  if (user.role === "MASTER") return true;
  // channel is "AHA" | "AHB" here — same as ChannelKey.
  return matchesOwner(user, CHANNEL_OWNERS[channel as ChannelKey]);
}

/**
 * Every LeadChannel the user is allowed to read leads from. Always
 * includes DEFAULT; adds AHA / AHB only when they qualify. Use the
 * returned list as a `channel: { in: ... }` Prisma filter to avoid
 * leaking private leads through list queries.
 */
export function visibleChannelsAll(user: CurrentUser): LeadChannel[] {
  const list: LeadChannel[] = ["DEFAULT"];
  if (canAccessLeadChannel(user, "AHA")) list.push("AHA");
  if (canAccessLeadChannel(user, "AHB")) list.push("AHB");
  return list;
}
