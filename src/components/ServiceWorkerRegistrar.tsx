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
    // updateViaCache:'none' — always bypass the HTTP cache when fetching
    // /sw.js so a deployed SW change is picked up on the very next open
    // instead of waiting on the browser's 24-hour SW script-cache. Then
    // proactively call update() to skip the "wait until next navigation"
    // window and check for a new SW right now.
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((reg) => {
        reg.update().catch(() => {});
        // If a new SW is already waiting, force it to activate right now
        // instead of waiting for every tab to close. Also handles the
        // freshly-installed case: `installing` transitions to `installed`
        // → we message it to SKIP_WAITING → it activates.
        const kick = (worker: ServiceWorker | null) => {
          if (worker) worker.postMessage({ type: "SKIP_WAITING" });
        };
        kick(reg.waiting);
        if (reg.installing) {
          const installing = reg.installing;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed") kick(installing);
          });
        }
        // When control passes to the new SW, reload once so the page runs
        // under the new asset cache and picks up the new UI.
        let reloading = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (reloading) return;
          reloading = true;
          window.location.reload();
        });
      })
      .catch(() => {
        /* ignore — privacy modes, file:// origins, ITP restrictions, etc. */
      });
  }, []);
  return null;
}
