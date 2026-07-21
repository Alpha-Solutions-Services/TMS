/* AFN TMS service worker — do not cache auth / login navigations */
const CACHE = "afn-tms-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept auth, APIs, or login — stale cache here breaks Google sign-in.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname === "/login" ||
    url.pathname.startsWith("/login/") ||
    url.pathname.startsWith("/accept-invite/")
  ) {
    return;
  }

  // Network-only for HTML navigations (no offline shell that can trap users).
  if (req.mode === "navigate") {
    return;
  }

  // Cache static assets only (icons/fonts/css/js).
  if (!url.pathname.match(/\.(js|css|png|svg|woff2?|webp|ico)$/)) {
    return;
  }

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok) {
        cache.put(req, res.clone());
      }
      return res;
    }),
  );
});
