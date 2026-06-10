"use client";

import { useEffect, useState, useTransition } from "react";
import { Smartphone, SmartphoneCharging, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Opts the current browser/device into Web Push notifications.
 *
 * Flow on first tap:
 *   1. Register /sw.js as a service worker
 *   2. Ask the browser for Notification permission
 *   3. Fetch the VAPID public key from /api/push/public-key
 *   4. Call sw.pushManager.subscribe with that key
 *   5. POST the subscription JSON to /api/push/subscribe
 *
 * The button toggles to "Disable" once subscribed; clicking it unsubscribes
 * on the device and tells the server.
 */
export function PushEnableButton() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (!("PushManager" in window)) return;
    if (!("Notification" in window)) return;
    setSupported(true);

    // Restore current subscription state.
    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) return;
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
      } catch {
        /* ignore */
      }
    })();
  }, []);

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
          setError("Permission denied — enable notifications in your browser settings.");
          return;
        }

        const keyRes = await fetch("/api/push/public-key", { cache: "no-store" });
        const { key } = (await keyRes.json()) as { key: string };
        if (!key) {
          setError("Push not configured on the server.");
          return;
        }

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
        });

        const subJson = sub.toJSON();
        const post = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(subJson),
        });
        if (!post.ok) {
          setError("Server didn't accept the subscription.");
          return;
        }
        setSubscribed(true);
      } catch (e) {
        setError((e as Error).message || "Couldn't enable push.");
      }
    });
  };

  const disable = () => {
    setError(null);
    startTransition(async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push/unsubscribe", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        setSubscribed(false);
      } catch (e) {
        setError((e as Error).message || "Couldn't disable push.");
      }
    });
  };

  if (!supported) return null;

  return (
    <div className="relative">
      <button
        onClick={subscribed ? disable : enable}
        disabled={pending}
        title={
          subscribed
            ? "Push notifications enabled on this device — click to disable"
            : "Enable push notifications (works even when the app is closed)"
        }
        className={cn(
          "grid h-9 w-9 place-items-center rounded-full transition-colors",
          subscribed
            ? "text-brand-700 bg-brand-50 ring-1 ring-brand-200"
            : "text-ink-700 bg-white ring-1 ring-ink-200 hover:bg-ink-50"
        )}
        aria-label={subscribed ? "Disable push" : "Enable push"}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : subscribed ? (
          <SmartphoneCharging className="h-4 w-4" />
        ) : (
          <Smartphone className="h-4 w-4" />
        )}
      </button>
      {error && (
        <div className="absolute top-full right-0 mt-2 w-64 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 shadow-soft z-50">
          {error}
        </div>
      )}
    </div>
  );
}

/**
 * Convert a base64url-encoded VAPID public key to the Uint8Array that
 * PushManager.subscribe wants.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
