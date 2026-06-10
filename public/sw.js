/**
 * Service worker for Leadboard.
 *
 *  - Listens for `push` events from the browser push service.
 *  - Shows a system notification using the payload sent by the server.
 *  - On click, focuses an existing tab (if any) or opens the lead URL.
 *
 * This file is served as-is from /sw.js so it runs in the dedicated SW
 * worker context, not the page context — no React, no ES modules, just
 * plain self-contained code.
 */

self.addEventListener("install", (event) => {
  // Activate the new SW immediately on update so users don't have to refresh.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Leadboard", body: event.data ? event.data.text() : "New activity" };
  }

  const title = data.title || "Leadboard";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon.png",
    badge: data.badge || "/icon.png",
    data: {
      url: data.url || "/dashboard",
      kind: data.kind || "status",
    },
    tag: data.tag || "leadboard",
    renotify: true,
    // Vibrate pattern (where supported).
    vibrate: data.kind === "approved" ? [200, 50, 200, 50, 400] : [120, 60, 120],
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
