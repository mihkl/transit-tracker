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
  complete?: boolean;
  endpoint?: string;
  jobPrefix?: string;
}

const skipCloseCancelTags = new Set<string>();

self.addEventListener("push", (event) => {
  const data = (event.data?.json() ?? {}) as ReminderPayload;
  const targetUrl = data.url || "/";
  const timestamp =
    typeof data.timestamp === "number" && Number.isFinite(data.timestamp)
      ? data.timestamp
      : Date.now();

  event.waitUntil(
    (async () => {
      const tag = data.tag ?? "leave-reminder";
      if (data.complete) {
        const active = await self.registration.getNotifications({ tag });
        await Promise.all(active.map((n) => n.close()));
        return;
      }

      await self.registration.showNotification(data.title ?? "Time to leave", {
        body: data.body ?? "Open Transit Tracker for updated directions.",
        icon: "/icon-192x192.png",
        badge: "/icons/notification-badge.svg",
        tag,
        renotify: false,
        requireInteraction: true,
        timestamp,
        data: {
          url: targetUrl,
          title: data.title ?? "Time to leave",
          body: data.body ?? "",
          tag,
          endpoint: data.endpoint,
          jobPrefix: data.jobPrefix,
        },
        actions: [
          { action: "open", title: "Open trip" },
          { action: "snooze-2m", title: "Snooze 2 min" },
          { action: "dismiss", title: "Dismiss" },
        ],
      });
    })(),
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
    endpoint?: string;
    jobPrefix?: string;
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
        endpoint: data.endpoint,
        jobPrefix: data.jobPrefix,
        jobKey: data.jobPrefix ? `${data.jobPrefix}snooze-${notifyAt}` : `snooze-${notifyAt}`,
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

async function cancelScheduledUpdates(endpoint?: string, jobPrefix?: string): Promise<void> {
  if (!endpoint || !jobPrefix) return;
  try {
    await fetch("/api/push", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, jobPrefix }),
    });
  } catch {
    // Ignore cancellation failures.
  }
}

self.addEventListener("notificationclick", (event) => {
  const clickedTag = event.notification.tag;
  if (clickedTag && event.action !== "dismiss") {
    skipCloseCancelTags.add(clickedTag);
  }
  event.notification.close();

  event.waitUntil(
    (async () => {
      const data = (event.notification.data ?? {}) as {
        url?: string;
        title?: string;
        body?: string;
        tag?: string;
        endpoint?: string;
        jobPrefix?: string;
      };
      const target = data.url || "/";

      if (event.action === "dismiss") {
        await cancelScheduledUpdates(data.endpoint, data.jobPrefix);
        return;
      }

      if (event.action === "snooze-2m") {
        const ok = await rescheduleByMinutes(2, data);
        if (!ok) {
          await self.registration.showNotification("Snooze failed", {
            body: "Could not schedule a new reminder. Open the app to retry.",
            icon: "/icon-192x192.png",
            badge: "/icons/notification-badge.svg",
            tag: "leave-reminder-error",
          });
        }
        return;
      }

      await focusOrOpen(target);
    })(),
  );
});

self.addEventListener("notificationclose", (event) => {
  if (event.notification.tag && skipCloseCancelTags.has(event.notification.tag)) {
    skipCloseCancelTags.delete(event.notification.tag);
    return;
  }
  const data = (event.notification.data ?? {}) as {
    endpoint?: string;
    jobPrefix?: string;
  };
  event.waitUntil(cancelScheduledUpdates(data.endpoint, data.jobPrefix));
});

// --- Lifecycle ---

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

// --- Fetch strategy ---

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

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
          }),
      ),
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
      .catch(() => caches.match(request) as Promise<Response>),
  );
});
