/// <reference lib="webworker" />
export type {};
declare const self: ServiceWorkerGlobalScope;

const PUSH_API_PATH = "/api/push";
const LEAVE_REMINDER_TAG = "leave-reminder";
const LEAVE_MAIN_SNOOZE_PREFIX = "leave-main-snooze-";
const LEAVE_REMINDER_CATEGORY = "leave-reminder";

const CACHE_NAME = "transit-tracker-v3";

const PRECACHE_URLS = ["/icon-192x192.png", "/icon-512x512.png"];

interface ReminderPayload {
  title?: string;
  body?: string;
  tag?: string;
  url?: string;
  timestamp?: number;
  category?: typeof LEAVE_REMINDER_CATEGORY;
  complete?: boolean;
  jobPrefix?: string;
}


self.addEventListener("push", (event) => {
  const data = (event.data?.json() ?? {}) as ReminderPayload;
  const targetUrl = data.url || "/";
  const timestamp =
    typeof data.timestamp === "number" && Number.isFinite(data.timestamp)
      ? data.timestamp
      : Date.now();

  event.waitUntil(
    (async () => {
      const tag = data.tag ?? LEAVE_REMINDER_TAG;
      if (data.complete) {
        const active = await self.registration.getNotifications({ tag });
        await Promise.all(active.map((n) => n.close()));
        return;
      }

      // TS's NotificationOptions is incomplete — cast to include spec properties
      // like renotify, timestamp, actions, badge, requireInteraction.
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
          jobPrefix: data.jobPrefix,
        },
        actions: [
          { action: "open", title: "Open trip" },
          { action: "snooze-2m", title: "Snooze 2 min" },
          { action: "dismiss", title: "Dismiss" },
        ],
      } as NotificationOptions);
    })(),
  );
});

async function focusOrOpenAsync(targetUrl: string) {
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  // Prefer visible/focused tab
  const windowClients = clients.filter(
    (c): c is WindowClient => c.type === "window",
  );
  windowClients.sort((a, b) => {
    const aVisible = a.visibilityState === "visible" ? 1 : 0;
    const bVisible = b.visibilityState === "visible" ? 1 : 0;
    return bVisible - aVisible;
  });

  if (windowClients.length > 0) {
    const best = windowClients[0];
    // Non-disruptive: send a message instead of navigating
    best.postMessage({ type: "trip-reminder", url: targetUrl });
    await best.focus();
    return;
  }

  // No existing window — cold start, navigate directly
  await self.clients.openWindow(targetUrl);
}

async function rescheduleByMinutesAsync(
  minutes: number,
  data: {
    title?: string;
    body?: string;
    tag?: string;
    url?: string;
    jobPrefix?: string;
  },
) {
  try {
    const reg = self.registration;
    const subscription = await reg.pushManager.getSubscription();
    if (!subscription) return false;

    const notifyAt = Date.now() + minutes * 60_000;
    const response = await fetch(PUSH_API_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        notifyAt,
        title: data.title ?? "Time to leave",
        body: data.body ?? "Open Transit Tracker for updated directions.",
        tag: data.tag ?? LEAVE_REMINDER_TAG,
        url: data.url ?? "/",
        timestamp: notifyAt,
        category: LEAVE_REMINDER_CATEGORY,
        jobKey: `${LEAVE_MAIN_SNOOZE_PREFIX}${notifyAt}`,
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

async function cancelScheduledUpdatesAsync(jobPrefix?: string) {
  if (!jobPrefix) return;
  try {
    const subscription = await self.registration.pushManager.getSubscription();
    if (!subscription) return;

    await fetch(PUSH_API_PATH, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        jobPrefix,
      }),
    });
  } catch {
    // Ignore cancellation failures.
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
        jobPrefix?: string;
      };
      const target = data.url || "/";

      if (event.action === "dismiss") {
        await cancelScheduledUpdatesAsync(data.jobPrefix);
        return;
      }

      if (event.action === "snooze-2m") {
        const ok = await rescheduleByMinutesAsync(2, data);
        if (!ok) {
          await self.registration.showNotification("Snooze failed", {
            body: "Could not schedule a new reminder. Open the app to retry.",
            icon: "/icon-192x192.png",
            badge: "/icons/notification-badge.svg",
            tag: `${LEAVE_REMINDER_TAG}-error`,
          });
        }
        return;
      }

      await focusOrOpenAsync(target);
    })(),
  );
});

// Swipe-dismiss should NOT cancel scheduled updates — only the explicit
// "Dismiss" action button cancels them (see notificationclick handler).
self.addEventListener("notificationclose", () => {});

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

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // Never intercept SSE or push API — let them go straight to the server
  if (url.pathname.startsWith("/api/")) return;

  // Skip large GTFS schedule file
  if (url.pathname.endsWith("schedule.json")) return;

  // Keep app shell/navigation always fresh to avoid stale UI in installed PWA mode.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request));
    return;
  }

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

  // Dynamic requests should stay network-backed to avoid stale RSC/app payloads.
  event.respondWith(fetch(request));
});
