const CACHE_NAME = "transit-tracker-v1";

let notificationTimer = null;

self.addEventListener("message", (event) => {
  if (event.data?.type === "SCHEDULE_NOTIFICATION") {
    if (notificationTimer) clearTimeout(notificationTimer);
    const { notifyAt, title, body } = event.data;
    const delay = notifyAt - Date.now();
    if (delay <= 0) return;
    notificationTimer = setTimeout(() => {
      self.registration.showNotification(title, {
        body,
        icon: "/icon-192x192.png",
      });
      notificationTimer = null;
    }, delay);
  } else if (event.data?.type === "CANCEL_NOTIFICATION") {
    if (notificationTimer) {
      clearTimeout(notificationTimer);
      notificationTimer = null;
    }
  }
});

const PRECACHE_URLS = ["/", "/icon-192x192.png", "/icon-512x512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip SSE stream — EventSource handles its own connection
  if (url.pathname.startsWith("/api/vehicles/stream")) return;

  // Skip large files (schedule data)
  if (url.pathname.endsWith("schedule.json")) return;

  // Cache-first for static assets
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|ico|woff2?|ttf|eot)$/)
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            return response;
          })
      )
    );
    return;
  }

  // Network-first for everything else (API routes, navigation)
  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      })
      .catch(() => caches.match(request))
  );
});
