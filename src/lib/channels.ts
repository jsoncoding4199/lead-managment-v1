import type { LeadChannel } from "@prisma/client";
import type { CurrentUser } from "./auth";

export type ChannelKey = "AHA" | "AHB";

export const CHANNEL_LABEL: Record<ChannelKey, string> = {
  AHA: "AHA",
  AHB: "AHB",
};

export const CHANNEL_KEYS: ChannelKey[] = ["AHA", "AHB"];

// Legacy: the named owners of each private channel. Kept only so admin
// UIs can display the canonical channel name. Authorization no longer
// depends on these strings — it uses the User.channel column instead.
export const CHANNEL_OWNERS: Record<ChannelKey, string> = {
  AHA: "AHA Adam",
  AHB: "AHB Eddie",
};

export function canSeeChannel(user: CurrentUser, channel: ChannelKey): boolean {
  if (user.role === "MASTER") return true;
  return user.channel === channel;
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
 *   - AHA / AHB    → only users whose User.channel matches, plus master
 *
 * Use this as the *only* check that says "can this user see this lead's
 * channel" — keeps the rule in one place.
 */
export function canAccessLeadChannel(user: CurrentUser, channel: LeadChannel): boolean {
  if (channel === "DEFAULT") return true;
  if (user.role === "MASTER") return true;
  return user.channel === channel;
}

/**
 * Every LeadChannel the user is allowed to read leads from. Always
 * includes DEFAULT; adds the user's assigned private channel if they
 * have one. Master sees everything.
 */
export function visibleChannelsAll(user: CurrentUser): LeadChannel[] {
  if (user.role === "MASTER") return ["DEFAULT", "AHA", "AHB"];
  const list: LeadChannel[] = ["DEFAULT"];
  if (user.channel === "AHA") list.push("AHA");
  if (user.channel === "AHB") list.push("AHB");
  return list;
}
