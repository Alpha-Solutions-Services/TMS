/* AFN TMS — network-first; do not cache HTML/auth. Carrier install UX only. */
const CACHE = "afn-tms-v5-carrier";

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
// Static assets may be browser-cached; we only need SW for installability.
self.addEventListener("fetch", () => {});
