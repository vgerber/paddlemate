// Web push for the generated service worker, loaded into it through
// workbox's importScripts (vite.config.ts). The server sends
// { title, body, url, tag }; see api/src/notify/mod.rs.

self.addEventListener("push", (event) => {
  let msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch {
    msg = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(msg.title || "Paddlemate", {
      body: msg.body || "",
      // One entry per trip on the lock screen, replaced by its next change.
      tag: msg.tag,
      renotify: Boolean(msg.tag),
      icon: "/pwa-192x192.png",
      badge: "/pwa-64x64.png",
      data: { url: msg.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Only ever a page of this app: whatever the payload names, a click never
  // opens another site.
  let url = new URL("/", self.location.origin);
  try {
    const target = new URL(
      event.notification.data?.url || "/",
      self.location.origin,
    );
    if (target.origin === self.location.origin) url = target;
  } catch {
    // Not a URL: open the app's start page.
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Reuse an open Paddlemate window rather than stacking new ones.
      const open = windows.find((w) => new URL(w.url).origin === url.origin);
      if (open) {
        await open.focus();
        return open.navigate(url.href);
      }
      return self.clients.openWindow(url.href);
    })(),
  );
});
