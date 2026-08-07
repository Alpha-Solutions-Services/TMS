/* AFN TMS — network-first; do not cache HTML/auth. */
const CACHE = "afn-tms-v6-driver-push";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Intentionally empty fetch handler — caching navigations broke Google login.
self.addEventListener("fetch", () => {});

/** Wake driver app when dispatch requests live GPS */
self.addEventListener("push", (event) => {
  let data = {
    title: "Alpha Freight",
    body: "Open the driver app",
    url: "/driver/dashboard?live=1",
    tag: "afn",
  };
  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch {
    /* ignore */
  }

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) {
        client.postMessage({ type: "LIVE_LOCATION_REQUEST" });
      }
      await self.registration.showNotification(data.title, {
        body: data.body,
        tag: data.tag || "live-location",
        data: { url: data.url },
        renotify: true,
        requireInteraction: true,
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/driver/dashboard?live=1";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of all) {
        if ("focus" in client) {
          client.postMessage({ type: "LIVE_LOCATION_REQUEST" });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })(),
  );
});
