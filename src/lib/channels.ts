import type { CurrentUser } from "./auth";

/**
 * NEW MODEL: private channels are per-user. A user with isPrivateChannel
 * = true owns their own private pipeline. Master can assign leads to any
 * private user; the leads carry `Lead.privateChannelUserId` pointing at
 * that user. Only the user (plus master) can see/touch them.
 *
 * Public leads have privateChannelUserId = null and live in the
 * Fresh/Market/Picks/Archive tabs everyone shares.
 */

/**
 * Can `user` read/touch a lead whose private owner is
 * `privateChannelUserId` (null = public)?
 *
 *   - public lead     → everyone
 *   - private lead    → only the channel owner and master
 */
export function canAccessLead(
  user: CurrentUser,
  privateChannelUserId: number | null
): boolean {
  if (privateChannelUserId === null) return true;
  if (user.role === "MASTER") return true;
  return privateChannelUserId === user.id;
}

/**
 * Convenience for actions that have a full Lead-like object. Same rule
 * as canAccessLead — just unwraps the field.
 */
export function canAccessLeadObj(
  user: CurrentUser,
  lead: { privateChannelUserId: number | null }
): boolean {
  return canAccessLead(user, lead.privateChannelUserId);
}

/**
 * Tab key used in URLs (`?tab=private-42`). Encodes a private channel
 * user's id so we can show that user's pipeline tab without a hardcoded
 * AHA/AHB scheme.
 */
export function privateChannelTabKey(userId: number): string {
  return `private-${userId}`;
}

export function parsePrivateChannelTab(tab: string | null | undefined): number | null {
  if (!tab) return null;
  const match = /^private-(\d+)$/.exec(tab);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}
