"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Bell, X, Loader2, History } from "lucide-react";
import { cn } from "@/lib/utils";

const SNOOZE_KEY = "lb:push-snooze-until";
const SNOOZE_MS = 24 * 60 * 60 * 1000;

/**
 * One-tap nudge to enable push notifications. Renders only when:
 *   - the server says this user has no PushSubscription rows, AND
 *   - the browser actually supports Web Push, AND
 *   - the user hasn't snoozed it in the last 24h.
 *
 * `hasServerSubscription` comes from the dashboard layout's DB count for
 * the current user. Once they tap Enable and the subscription POSTs
 * successfully, the banner hides locally and stays hidden until the
 * server-side prop refreshes on next navigation.
 */
export function PushNudgeBanner({
  hasServerSubscription,
}: {
  hasServerSubscription: boolean;
}) {
  // Server already knows whether they have a subscription. If they do,
  // never show the banner — avoids any flash during hydration.
  const [hidden, setHidden] = useState(hasServerSubscription);
  const [supported, setSupported] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setHidden(true);
      return;
    }
    setSupported(true);

    if (hasServerSubscription) {
      setHidden(true);
      return;
    }

    // Snooze check
    try {
      const raw = window.localStorage.getItem(SNOOZE_KEY);
      if (raw && Number(raw) > Date.now()) {
        setHidden(true);
        return;
      }
    } catch {
      /* localStorage blocked — show the banner anyway, no big deal */
    }

    // Maybe the user already enabled push on this device but the server
    // forgot (e.g. DB cleanup). Re-POST their existing subscription so
    // server state lines up — no banner needed.
    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(sub.toJSON()),
          });
          setHidden(true);
        }
      } catch {
        /* fall through — show the banner */
      }
    })();
  }, [hasServerSubscription]);

  const snooze = () => {
    try {
      window.localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {
      /* ignore */
    }
    setHidden(true);
  };

  const enable = () => {
    setError(null);
    startTransition(async () => {
      try {
        const reg =
          (await navigator.serviceWorker.getRegistration()) ??
          (await navigator.serviceWorker.register("/sw.js"));
        await navigator.serviceWorker.ready;

        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          setError("Notifications are blocked. Open browser settings to enable.");
          return;
        }

        const keyRes = await fetch("/api/push/public-key", { cache: "no-store" });
        const { key } = (await keyRes.json()) as { key: string };
        if (!key) {
          setError("Push isn't configured on the server.");
          return;
        }

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
        });

        const post = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        });
        if (!post.ok) {
          setError("Server didn't accept the subscription.");
          return;
        }

        // Clear any old snooze so future navigations don't accidentally hide
        // the (now unneeded) banner.
        try {
          window.localStorage.removeItem(SNOOZE_KEY);
        } catch {
          /* ignore */
        }
        setHidden(true);
      } catch (e) {
        setError((e as Error).message || "Couldn't enable push.");
      }
    });
  };

  if (!supported || hidden) return null;

  return (
    <div className="card mb-4 border-brand-200 bg-gradient-to-br from-brand-50 to-white p-4 flex items-start gap-3 animate-in">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700">
        <Bell className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink-900">
          Get notified about new leads
        </p>
        <p className="mt-0.5 text-xs text-ink-600">
          Push notifications work even when the app is closed. One-tap setup.
        </p>
        {error && (
          <p className="mt-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
            {error}
          </p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={enable}
            disabled={pending}
            className={cn(
              "btn btn-accent h-8 text-xs px-3",
              pending && "opacity-70"
            )}
          >
            {pending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Enabling…
              </>
            ) : (
              "Enable notifications"
            )}
          </button>
          <Link
            href="/dashboard/notifications"
            className="btn btn-ghost h-8 text-xs px-3 text-ink-700 inline-flex items-center gap-1"
          >
            <History className="h-3.5 w-3.5" />
            View notifications
          </Link>
          <button
            type="button"
            onClick={snooze}
            disabled={pending}
            className="btn btn-ghost h-8 text-xs px-2 text-ink-600"
          >
            Not now
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={snooze}
        aria-label="Dismiss"
        className="shrink-0 rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
