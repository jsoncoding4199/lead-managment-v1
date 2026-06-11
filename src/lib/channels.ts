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
