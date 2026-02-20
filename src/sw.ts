/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME = "transit-tracker-v2";

const PRECACHE_URLS = ["/", "/icon-192x192.png", "/icon-512x512.png"];

interface ReminderPayload {
  title?: string;
  body?: string;
  tag?: string;
  url?: string;
  timestamp?: number;
  category?: "leave-reminder";
}

self.addEventListener("push", (event) => {
  const data = (event.data?.json() ?? {}) as ReminderPayload;
  const targetUrl = data.url || "/";
  const timestamp =
    typeof data.timestamp === "number" && Number.isFinite(data.timestamp)
      ? data.timestamp
      : Date.now();

  event.waitUntil(
    self.registration.showNotification(data.title ?? "Time to leave", {
      body: data.body ?? "Open Transit Tracker for updated directions.",
      icon: "/icon-192x192.png",
      badge: "/icon-192x192.png",
      tag: data.tag ?? "leave-reminder",
      renotify: true,
      requireInteraction: true,
      timestamp,
      data: {
        url: targetUrl,
        title: data.title ?? "Time to leave",
        body: data.body ?? "",
        tag: data.tag ?? "leave-reminder",
      },
      actions: [
        { action: "open", title: "Open trip" },
        { action: "snooze-2m", title: "Snooze 2 min" },
        { action: "dismiss", title: "Dismiss" },
      ],
    }),
  );
});

async function focusOrOpen(targetUrl: string): Promise<void> {
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of clients) {
    if (client.type !== "window") continue;
    const windowClient = client as WindowClient;
    if ("navigate" in windowClient) {
      await windowClient.navigate(targetUrl);
    }
    await windowClient.focus();
    return;
  }
  await self.clients.openWindow(targetUrl);
}

async function rescheduleByMinutes(
  minutes: number,
  data: {
    title?: string;
    body?: string;
    tag?: string;
    url?: string;
  },
): Promise<boolean> {
  try {
    const reg = await self.registration;
    const subscription = await reg.pushManager.getSubscription();
    if (!subscription) return false;

    const notifyAt = Date.now() + minutes * 60_000;
    const response = await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        notifyAt,
        title: data.title ?? "Time to leave",
        body: data.body ?? "Open Transit Tracker for updated directions.",
        tag: data.tag ?? "leave-reminder",
        url: data.url ?? "/",
        timestamp: notifyAt,
        category: "leave-reminder",
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      const data = (event.notification.data ?? {}) as {
        url?: string;
        title?: string;
        body?: string;
        tag?: string;
      };
      const target = data.url || "/";

      if (event.action === "dismiss") {
        return;
      }

      if (event.action === "snooze-2m") {
        const ok = await rescheduleByMinutes(2, data);
        if (!ok) {
          await self.registration.showNotification("Snooze failed", {
            body: "Could not schedule a new reminder. Open the app to retry.",
            icon: "/icon-192x192.png",
            badge: "/icon-192x192.png",
            tag: "leave-reminder-error",
          });
        }
        return;
      }

      await focusOrOpen(target);
    })(),
  );
});

// --- Lifecycle ---

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
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// --- Fetch strategy ---

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  // Never intercept SSE or push API — let them go straight to the server
  if (url.pathname.startsWith("/api/")) return;

  // Skip large GTFS schedule file
  if (url.pathname.endsWith("schedule.json")) return;

  // Cache-first for immutable static assets
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|ico|woff2?|ttf|eot)$/)
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            return response;
          })
      )
    );
    return;
  }

  // Network-first for navigation and everything else
  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      })
      .catch(() => caches.match(request) as Promise<Response>)
  );
});
