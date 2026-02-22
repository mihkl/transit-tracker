import webpush from "web-push";
import type { PushSubscription } from "web-push";

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

interface ScheduledEntry {
  timeoutId: ReturnType<typeof setTimeout> | null;
  endpoint: string;
  jobKey: string;
  notifyAt: number;
  subscription: PushSubscription;
  payload: PushPayload;
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
const MAX_TOTAL_SCHEDULED = 5_000;
const MAX_PER_ENDPOINT = 50;
const MAX_TIMER_DELAY_MS = 2_147_483_647;

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
  if (entry.timeoutId) clearTimeout(entry.timeoutId);
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

function getEndpointCount(endpoint: string): number {
  return endpointIndex.get(endpoint)?.size ?? 0;
}

function assertSchedulingCapacity(endpoint: string, scheduleKey: string) {
  const isExisting = scheduled.has(scheduleKey);
  if (!isExisting && scheduled.size >= MAX_TOTAL_SCHEDULED) {
    throw new Error("Push scheduler capacity exceeded");
  }

  if (!isExisting && getEndpointCount(endpoint) >= MAX_PER_ENDPOINT) {
    throw new Error("Push scheduler per-endpoint limit exceeded");
  }
}

function armTimer(entry: ScheduledEntry, scheduleKey: string): void {
  const delay = entry.notifyAt - Date.now();

  if (delay <= 0) {
    // Invariant: the entry has already been inserted into `scheduled` and
    // `endpointIndex` by the caller before armTimer is invoked, so
    // clearScheduleKey will find and clean it up correctly.
    sendPush(entry.subscription, entry.payload);
    clearScheduleKey(scheduleKey);
    return;
  }

  const nextDelay = Math.min(delay, MAX_TIMER_DELAY_MS);
  entry.timeoutId = setTimeout(() => {
    const current = scheduled.get(scheduleKey);
    if (!current) return;
    armTimer(current, scheduleKey);
  }, nextDelay);
}

export function scheduleNotification(
  subscription: PushSubscription,
  notifyAt: number,
  payload: PushPayload,
  jobKey = "default",
) {
  const scheduleKey = toScheduleKey(subscription.endpoint, jobKey);
  clearScheduleKey(scheduleKey);
  assertSchedulingCapacity(subscription.endpoint, scheduleKey);

  if (notifyAt <= Date.now()) {
    sendPush(subscription, payload);
    return;
  }

  const entry: ScheduledEntry = {
    timeoutId: null,
    endpoint: subscription.endpoint,
    jobKey,
    notifyAt,
    subscription,
    payload,
  };

  scheduled.set(scheduleKey, entry);
  indexKey(subscription.endpoint, scheduleKey);
  armTimer(entry, scheduleKey);
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

export const vapidPublicKey = VAPID_PUBLIC_KEY;
