"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X, Sparkles, Plus, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type EventKind = "status" | "lead" | "approved";
type Event = { id: string; kind: EventKind; text: string; at: string; leadId: number };

type Toast = { id: number; kind: EventKind; text: string; href: string };

/**
 * Polling cadence:
 *   - Without push: 5s. Tight enough to feel "live" without hammering the API.
 *   - With push:    30s. Push handles the realtime path; this is just a
 *                   fallback for catching missed events / stale data.
 *
 * The push service worker also `postMessage`s the page on every push event,
 * so the UI refreshes instantly — polling is purely belt-and-braces when
 * push is on.
 */
const POLL_MS_NO_PUSH = 5_000;
const POLL_MS_WITH_PUSH = 30_000;
const TOAST_TTL = 7_000;

/**
 * Near-real-time updates without a websocket service:
 *
 *  - polls /api/changes every POLL_MS while the tab is visible
 *  - triggers router.refresh() when there are new events
 *  - each event is shown as a toast bottom-right
 *  - native OS notification if the user has granted permission via the bell
 *
 * Approved events get celebratory styling (master sees these only).
 */
export function Notifier() {
  const router = useRouter();
  const lastCheckRef = useRef<string>(new Date().toISOString());
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((kind: EventKind, text: string, leadId: number) => {
    const id = Date.now() + Math.random();
    const href = `/dashboard/leads/${leadId}`;
    setToasts((t) => [...t, { id, kind, text, href }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, TOAST_TTL);
  }, []);

  // Track whether push is active so we can ease off the polling interval.
  const [pushActive, setPushActive] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (!cancelled) setPushActive(!!sub);
      } catch {
        /* push API unavailable */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Service worker pushes a `lb:refresh` message after every push event so
  // the UI rehydrates the instant the push lands — no polling delay.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "lb:refresh") {
        router.refresh();
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const intervalMs = pushActive ? POLL_MS_WITH_PUSH : POLL_MS_NO_PUSH;

    const tick = async () => {
      if (cancelled) return;
      if (document.hidden) {
        schedule();
        return;
      }
      try {
        const url = `/api/changes?since=${encodeURIComponent(lastCheckRef.current)}`;
        const res = await fetch(url, { cache: "no-store" });
        if (res.status === 401) return; // session expired, stop polling
        if (!res.ok) {
          schedule();
          return;
        }
        const data: { events: Event[]; hasNew: boolean; now: string } = await res.json();
        if (data.hasNew && data.events.length > 0) {
          for (const ev of data.events.slice(0, 5)) {
            pushToast(ev.kind, ev.text, ev.leadId);
          }
          router.refresh();
        }
        lastCheckRef.current = data.now;
      } catch {
        /* network blip — retry next tick */
      } finally {
        schedule();
      }
    };

    const schedule = () => {
      if (cancelled) return;
      timer = window.setTimeout(tick, intervalMs);
    };

    // Kick off a beat after mount so we don't race hydration.
    timer = window.setTimeout(tick, 1500);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [router, pushToast, pushActive]);

  return (
    <>
      <div className="fixed bottom-4 right-4 z-[110] w-[calc(100%-2rem)] sm:w-96 space-y-2 pointer-events-none">
        {toasts.map((t) => (
          <a
            key={t.id}
            href={t.href}
            className={cn(
              "pointer-events-auto block rounded-xl border p-3 shadow-lift animate-in transition-colors",
              t.kind === "approved"
                ? "border-emerald-300 bg-emerald-50/95 backdrop-blur hover:bg-emerald-50"
                : t.kind === "lead"
                  ? "border-brand-300 bg-brand-50/95 backdrop-blur hover:bg-brand-50"
                  : "border-ink-200 bg-white/95 backdrop-blur hover:bg-ink-50"
            )}
          >
            <div className="flex items-start gap-2">
              {t.kind === "approved" ? (
                <Sparkles className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : t.kind === "lead" ? (
                <Plus className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
              ) : (
                <ArrowRight className="h-4 w-4 text-ink-700 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-[13px] leading-relaxed break-words max-h-40 overflow-y-auto",
                    t.kind === "approved"
                      ? "text-emerald-900"
                      : t.kind === "lead"
                        ? "text-brand-900"
                        : "text-ink-800"
                  )}
                >
                  {t.text}
                </p>
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
