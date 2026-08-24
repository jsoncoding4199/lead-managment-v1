import clsx, { type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * Wall-clock timezone for every date the app displays. The team is in
 * Malaysia (UTC+8); pinning it here keeps the server (Vercel runs in UTC
 * by default) and the client showing the same timestamp — no hydration
 * mismatch, no UTC flash before hydration. Change in one place if the
 * team ever relocates.
 */
const APP_TIMEZONE = "Asia/Kuala_Lumpur";

export function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: APP_TIMEZONE,
  }).format(d);
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: APP_TIMEZONE,
  }).format(d);
}

/**
 * wa.me requires the international form with no + — a local "0173705170"
 * opens the wrong chat (or none). Display and tel: stay local; only the
 * WhatsApp link goes through here.
 *
 * ponytail: assumes a Malaysian number when there's no country code,
 * which is the whole team. A leading 6 (60… local, 65… Singapore) is
 * taken as already-international and passed through.
 */
export function waNumber(raw: string): string {
  const d = raw.replace(/\D+/g, "");
  if (!d) return "";
  if (d.startsWith("6")) return d;
  if (d.startsWith("0")) return "60" + d.slice(1);
  // Excel strips the leading zero off a numeric phone column.
  return "60" + d;
}

/**
 * Strip a leading Malaysian country code so a phone shows/stores in local
 * form: "+60103990078" → "0103990078". Only touches a literal leading "+6"
 * (optionally spaced); anything already local ("0…") is returned unchanged.
 * wa.me links still work — waNumber() re-adds the 60 prefix on the fly.
 */
export function localPhone(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/^\+\s*6\s*/, "");
}

export function daysAgo(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  const ms = Date.now() - d.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}
