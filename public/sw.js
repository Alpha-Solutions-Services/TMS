/* AFN TMS — network-only; never cache HTML or auth */
const CACHE = "afn-tms-v4";

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

// Do not intercept fetches — install prompt UI is enough; caching broke login.
self.addEventListener("fetch", () => {});
