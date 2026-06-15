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

export function daysAgo(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  const ms = Date.now() - d.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}
