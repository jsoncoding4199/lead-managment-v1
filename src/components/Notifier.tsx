"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellRing, X, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

type Event = { id: string; kind: "status" | "comment" | "lead"; text: string; at: string; leadId: number };

type Toast = { id: number; text: string; href: string };

const POLL_MS = 10_000; // 10s
const TOAST_TTL = 7_000;

/**
 * Near-real-time updates without a separate websocket service:
 *
 *  - polls /api/changes every 10s while the tab is visible
 *  - triggers router.refresh() when there are new events (so the page data
 *    re-fetches and updates without a hard reload)
 *  - surfaces each event as a small toast in the bottom-right
 *  - if the user has granted Notification permission, also fires a native
 *    OS notification (visible even when the browser is unfocused, as long
 *    as the tab is still open)
 *
 * Permission prompt is opt-in (the bell button) so we don't blast users
 * with a permission dialog on first visit.
 */
export function Notifier() {
  const router = useRouter();
  const lastCheckRef = useRef<string>(new Date().toISOString());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [perm, setPerm] = useState<NotificationPermission>("default");
  const [online, setOnline] = useState(true);

  // Sync permission state on mount.
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    setPerm(Notification.permission);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const pushToast = useCallback((text: string, leadId: number) => {
    const id = Date.now() + Math.random();
    const href = `/dashboard/leads/${leadId}`;
    setToasts((t) => [...t, { id, text, href }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, TOAST_TTL);
  }, []);

  const fireBrowserNotification = useCallback((text: string, href: string) => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try {
      const n = new Notification("Leadboard", { body: text, tag: "leadboard" });
      n.onclick = () => {
        window.focus();
        window.location.href = href;
        n.close();
      };
    } catch {
      /* some browsers throw when called from a non-secure or background context */
    }
  }, []);

  // Polling loop.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      if (cancelled) return;
      if (document.hidden) {
        schedule();
        return;
      }
      try {
        const url = `/api/changes?since=${encodeURIComponent(lastCheckRef.current)}`;
        const res = await fetch(url, { cache: "no-store" });
        if (res.status === 401) {
          // Session expired -- stop polling, let the next nav redirect to /login.
          return;
        }
        if (!res.ok) {
          schedule();
          return;
        }
        const data: { events: Event[]; hasNew: boolean; now: string } = await res.json();
        if (data.hasNew && data.events.length > 0) {
          for (const ev of data.events.slice(0, 5)) {
            pushToast(ev.text, ev.leadId);
            fireBrowserNotification(ev.text, `/dashboard/leads/${ev.leadId}`);
          }
          router.refresh();
        }
        lastCheckRef.current = data.now;
      } catch {
        // Network blip -- try again next tick.
      } finally {
        schedule();
      }
    };

    const schedule = () => {
      if (cancelled) return;
      timer = window.setTimeout(tick, POLL_MS);
    };

    // Kick the first poll a beat after mount so we don't race hydration.
    timer = window.setTimeout(tick, 2000);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [router, pushToast, fireBrowserNotification]);

  const askPermission = async () => {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPerm(result);
  };

  return (
    <>
      {/* Bell button — appears in the header via the page chrome */}
      <button
        onClick={askPermission}
        title={
          perm === "granted"
            ? "Browser notifications enabled"
            : perm === "denied"
              ? "Notifications blocked in your browser settings"
              : "Enable browser notifications"
        }
        disabled={perm !== "default"}
        className={cn(
          "relative grid h-9 w-9 place-items-center rounded-full transition-colors",
          perm === "granted"
            ? "text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200"
            : perm === "denied"
              ? "text-ink-400 bg-ink-100"
              : "text-ink-700 bg-white ring-1 ring-ink-200 hover:bg-ink-50"
        )}
        aria-label="Notifications"
      >
        {perm === "granted" ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        {!online && (
          <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-rose-500 text-white text-[8px]">
            <Wifi className="h-2.5 w-2.5" />
          </span>
        )}
      </button>

      {/* Toast stack — portal-ish via fixed positioning, z above modal portal */}
      <div className="fixed bottom-4 right-4 z-[110] w-[calc(100%-2rem)] sm:w-96 space-y-2 pointer-events-none">
        {toasts.map((t) => (
          <a
            key={t.id}
            href={t.href}
            className="pointer-events-auto block rounded-xl border border-ink-200 bg-white/95 backdrop-blur p-3 shadow-lift animate-in hover:bg-ink-50"
          >
            <div className="flex items-start gap-2">
              <BellRing className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] leading-relaxed text-ink-800 line-clamp-3">{t.text}</p>
              </div>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setToasts((arr) => arr.filter((x) => x.id !== t.id));
                }}
                className="shrink-0 rounded p-0.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </a>
        ))}
      </div>
    </>
  );
}
