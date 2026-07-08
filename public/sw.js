/**
 * Service worker for Leadboard.
 *
 *  - Precaches the PWA shell (manifest + icons) on install.
 *  - Cache-first for /_next/static/* (immutable hashed bundles) so repeat
 *    opens paint the dashboard skeleton instantly without re-downloading
 *    100+ KB of JS/CSS.
 *  - Cache-first for icons / manifest (precached at install).
 *  - Everything else (HTML, /api/*, RSC payloads, server actions) passes
 *    straight through to the network — no risk of serving stale or
 *    cross-user data.
 *  - Listens for `push` events and shows a system notification.
 *  - Tells every open tab to refresh after a push so the UI updates
 *    instantly without waiting for the next poll.
 *
 * This file is served as-is from /sw.js so it runs in the dedicated SW
 * worker context, not the page context — no React, no ES modules, just
 * plain self-contained code.
 *
 * Bump CACHE_VERSION when changing precache contents or caching strategy
 * so old caches get purged on activate.
 */

const CACHE_VERSION = "leadboard-shell-v5";

// File extensions that are safe to cache long-term. Static assets the user
// downloaded once shouldn't redownload on every cold start of the TWA.
const STATIC_EXT_RE = /\.(png|jpg|jpeg|svg|webp|gif|ico|woff2?|ttf|otf|css)$/i;

const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/icon.png",
  "/apple-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      // Precache shell assets. We swallow individual failures so a missing
      // asset (e.g. apple-icon during dev) doesn't tank the whole install.
      const cache = await caches.open(CACHE_VERSION);
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            const res = await fetch(url, { cache: "reload" });
            if (res.ok) await cache.put(url, res);
          } catch (e) {
            /* ignore — best-effort precache */
          }
        })
      );
      // Activate the new SW immediately on update so users don't have to refresh.
      await self.skipWaiting();
    })()
  );
});

// Let a page force this SW to skip the "waiting" state and take control
// immediately after a deploy. The registrar posts this message right after
// register().update() so the new SW never has to wait for a navigation.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Purge any stale caches from previous SW versions.
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Only handle same-origin GETs. Everything cross-origin (push services,
  // CDNs, third-party fonts) goes straight to the network.
  if (url.origin !== self.location.origin) return;

  // Never cache API routes or RSC payloads — they're personalized and
  // auth-gated. Serving a cached one to another user would leak data.
  if (url.pathname.startsWith("/api/")) return;
  if (url.search.includes("_rsc=")) return;

  // Cache-first for immutable Next.js hashed bundles. These URLs change
  // every deploy, so the cached copy is always valid for its filename.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Cache-first for the precached shell assets (manifest + icons).
  if (
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/icon.png" ||
    url.pathname === "/apple-icon.png" ||
    url.pathname === "/favicon.ico"
  ) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Cache-first for any static asset by extension. Same SWR behavior — the
  // cached copy paints immediately, the network refreshes it for next time.
  // Safe because these files are non-personalized and rarely change.
  if (STATIC_EXT_RE.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Everything else (HTML, server actions, etc.) → straight to network.
  // We intentionally do NOT cache HTML to avoid cross-session staleness.
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(req);
  if (cached) {
    // Refresh the cached copy in the background so the next open gets the
    // latest, but serve the cached one right now for instant paint.
    revalidateInBackground(cache, req);
    return cached;
  }
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      // Clone before consuming — Response bodies can only be read once.
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch (err) {
    // Network down and no cache — let the browser show its offline error.
    throw err;
  }
}

function revalidateInBackground(cache, req) {
  // Fire-and-forget revalidation. Avoids blocking the response on a
  // network round-trip but keeps the cache fresh for the next time.
  fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    })
    .catch(() => {});
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Leadboard", body: event.data ? event.data.text() : "New activity" };
  }

  const title = data.title || "Leadboard";
  const options = {
    // Android drops notifications with an empty body on some builds — a
    // single space is enough to keep the OS happy and still look empty.
    body: data.body || " ",
    icon: data.icon || "/icon.png",
    badge: data.badge || "/icon.png",
    data: {
      url: data.url || "/dashboard",
      kind: data.kind || "status",
    },
    tag: data.tag || "leadboard",
    renotify: true,
    // Vibrate pattern (where supported). Including a vibrate field signals
    // to Android that this is an "alerting" notification (heads-up + sound
    // + lock-screen visible) instead of a silent one.
    vibrate: data.kind === "approved" ? [200, 50, 200, 50, 400] : [120, 60, 120],
    // Explicit silent:false makes intent clear to OS notification channels.
    silent: false,
    // Server-supplied timestamp so OS sorts events chronologically.
    timestamp: Date.now(),
    // requireInteraction keeps important events on screen until the user
    // dismisses them. Applied to approved + new-lead events (high signal);
    // generic status changes auto-dismiss after a few seconds.
    requireInteraction: data.kind === "approved" || data.kind === "lead",
    // One-tap actions render as buttons below the notification on Android,
    // adding visible weight and giving the user a fast "Open" affordance.
    actions: [
      { action: "open", title: "Open" },
    ],
  };

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      // Push happened — tell every open tab to re-fetch fresh server data,
      // so the UI updates instantly without waiting for the next poll.
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ type: "lb:refresh", at: Date.now(), kind: data.kind || "status" });
      }
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.notification.close();

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Try to focus an existing tab and navigate it.
        for (const client of clientList) {
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) {
              try {
                client.navigate(url);
              } catch (e) {
                /* navigate fails cross-origin — fine, fall through */
              }
              return;
            }
          }
        }
        // No tab open — open a new one.
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
  );
});
