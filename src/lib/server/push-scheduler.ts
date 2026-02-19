import webpush from "web-push";
import type { PushSubscription } from "web-push";

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    VAPID_SUBJECT || "mailto:admin@example.com",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );
}

interface ScheduledEntry {
  timeoutId: ReturnType<typeof setTimeout>;
}

// endpoint → pending notification
const scheduled = new Map<string, ScheduledEntry>();

async function sendPush(subscription: PushSubscription, payload: object) {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
  } catch (err) {
    const e = err as { statusCode?: number };
    // 404/410 = subscription expired or unsubscribed — clean up
    if (e.statusCode === 404 || e.statusCode === 410) {
      scheduled.delete(subscription.endpoint);
    }
  }
}

export function scheduleNotification(
  subscription: PushSubscription,
  notifyAt: number,
  title: string,
  body: string,
) {
  // Replace any existing scheduled notification for this subscription
  const existing = scheduled.get(subscription.endpoint);
  if (existing) clearTimeout(existing.timeoutId);

  const delay = notifyAt - Date.now();
  if (delay <= 0) {
    sendPush(subscription, { title, body });
    return;
  }

  const timeoutId = setTimeout(() => {
    sendPush(subscription, { title, body });
    scheduled.delete(subscription.endpoint);
  }, delay);

  scheduled.set(subscription.endpoint, { timeoutId });
}

export function cancelNotification(endpoint: string) {
  const existing = scheduled.get(endpoint);
  if (existing) {
    clearTimeout(existing.timeoutId);
    scheduled.delete(endpoint);
  }
}

export const vapidPublicKey = VAPID_PUBLIC_KEY ?? "";
