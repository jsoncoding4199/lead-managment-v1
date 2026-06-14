"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js on every page load — including the public login page.
 *
 * Previously we only registered the service worker when the user tapped
 * the push-enable button or the nudge banner, both of which only mount
 * inside the authenticated dashboard. That left the SW invisible to
 * external crawlers (PWABuilder, Lighthouse, Chrome's PWA installability
 * check) which hit the public landing page first and concluded "no SW
 * here, not a PWA".
 *
 * Eager registration here:
 *   - Lets PWABuilder discover the SW so TWA packaging succeeds.
 *   - Primes the SW precache earlier so even the first authenticated
 *     load is served partly from cache.
 *   - Idempotent — `register()` reuses an existing registration if one
 *     is already active.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Fire-and-forget. Failures are non-fatal — SW just stays unregistered
    // for this session and the app degrades to its non-cached path.
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* ignore — privacy modes, file:// origins, ITP restrictions, etc. */
    });
  }, []);
  return null;
}
