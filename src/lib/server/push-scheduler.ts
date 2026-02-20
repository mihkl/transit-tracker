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
  endpoint: string;
  jobKey: string;
}

interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  timestamp?: number;
  category?: string;
}

const scheduled = new Map<string, ScheduledEntry>();
const endpointIndex = new Map<string, Set<string>>();

function toScheduleKey(endpoint: string, jobKey: string): string {
  return `${endpoint}::${jobKey}`;
}

function indexKey(endpoint: string, scheduleKey: string) {
  let keys = endpointIndex.get(endpoint);
  if (!keys) {
    keys = new Set<string>();
    endpointIndex.set(endpoint, keys);
  }
  keys.add(scheduleKey);
}

function unindexKey(endpoint: string, scheduleKey: string) {
  const keys = endpointIndex.get(endpoint);
  if (!keys) return;
  keys.delete(scheduleKey);
  if (keys.size === 0) endpointIndex.delete(endpoint);
}

function clearScheduleKey(scheduleKey: string) {
  const entry = scheduled.get(scheduleKey);
  if (!entry) return;
  clearTimeout(entry.timeoutId);
  scheduled.delete(scheduleKey);
  unindexKey(entry.endpoint, scheduleKey);
}

async function sendPush(subscription: PushSubscription, payload: PushPayload) {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
  } catch (err) {
    const e = err as { statusCode?: number };
    // 404/410 = subscription expired or unsubscribed — clean up
    if (e.statusCode === 404 || e.statusCode === 410) {
      cancelNotification(subscription.endpoint);
    }
  }
}

export function scheduleNotification(
  subscription: PushSubscription,
  notifyAt: number,
  payload: PushPayload,
  jobKey = "default",
) {
  const scheduleKey = toScheduleKey(subscription.endpoint, jobKey);
  clearScheduleKey(scheduleKey);

  const delay = notifyAt - Date.now();
  if (delay <= 0) {
    sendPush(subscription, payload);
    return;
  }

  const timeoutId = setTimeout(() => {
    sendPush(subscription, payload);
    clearScheduleKey(scheduleKey);
  }, delay);

  scheduled.set(scheduleKey, {
    timeoutId,
    endpoint: subscription.endpoint,
    jobKey,
  });
  indexKey(subscription.endpoint, scheduleKey);
}

export function cancelNotification(endpoint: string, jobPrefix?: string) {
  const keys = endpointIndex.get(endpoint);
  if (!keys || keys.size === 0) return;

  const toCancel = Array.from(keys).filter((scheduleKey) => {
    if (!jobPrefix) return true;
    const entry = scheduled.get(scheduleKey);
    return !!entry && entry.jobKey.startsWith(jobPrefix);
  });

  for (const key of toCancel) {
    clearScheduleKey(key);
  }
}

export const vapidPublicKey = VAPID_PUBLIC_KEY ?? "";
