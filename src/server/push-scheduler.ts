import { createHash } from "node:crypto";
import { and, asc, count, desc, eq, isNotNull, like, lte, or, type SQL } from "drizzle-orm";
import { resolve } from "node:path";
import webpush from "web-push";
import type { PushSubscription } from "web-push";
import { migrate } from "drizzle-orm/libsql/migrator";
import { env } from "@/lib/env";
import { pushDb } from "@/server/push-db";
import { pushNotifications } from "@/server/push-schema";

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = env;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  timestamp?: number;
  category?: string;
  jobPrefix?: string;
}

interface ClaimedNotification {
  id: string;
  endpoint: string;
  attemptCount: number;
  subscriptionJson: string;
  payloadJson: string;
}

interface SchedulerState {
  initialized: boolean;
  started: boolean;
  dispatching: boolean;
  intervalId: ReturnType<typeof setInterval> | null;
}

const DISPATCH_INTERVAL_MS = 60_000;
const CLAIM_STALE_MS = 3 * 60_000;
const MAX_BATCH_SIZE = 50;
const MAX_ATTEMPTS = 5;
const IMMEDIATE_DISPATCH_WINDOW_MS = 5_000;
const PRUNE_SENT_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
const PRUNE_FAILED_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ACTIVE_NOTIFICATIONS = 5_000;
const MAX_ACTIVE_PER_ENDPOINT = 12;
const MAX_ACTIVE_DELAY_UPDATES_PER_ENDPOINT = 4;
const STATE_KEY = "__transitPushSchedulerState__";
const DELAY_UPDATE_PREFIX = "delay-update-";

function getState() {
  const scoped = globalThis as typeof globalThis & {
    [STATE_KEY]?: SchedulerState;
  };

  if (!scoped[STATE_KEY]) {
    scoped[STATE_KEY] = {
      initialized: false,
      started: false,
      dispatching: false,
      intervalId: null,
    };
  }

  return scoped[STATE_KEY];
}

async function initializePushStore() {
  const state = getState();
  if (state.initialized) return;

  await migrate(pushDb, {
    migrationsFolder: resolve(process.cwd(), "drizzle"),
  });

  state.initialized = true;
}

function toNotificationId(endpoint: string, jobKey: string) {
  return createHash("sha256").update(`${endpoint}::${jobKey}`).digest("hex");
}

function isDelayUpdateJob(jobKey: string) {
  return jobKey.startsWith(DELAY_UPDATE_PREFIX);
}

async function getExistingNotificationId(endpoint: string, jobKey: string) {
  const existing = await pushDb
    .select({
      id: pushNotifications.id,
    })
    .from(pushNotifications)
    .where(
      and(eq(pushNotifications.endpoint, endpoint), eq(pushNotifications.jobKey, jobKey)),
    )
    .limit(1);

  return existing[0]?.id ?? null;
}

async function countActiveNotifications(where: SQL<unknown> | undefined) {
  const rows = await pushDb
    .select({
      count: count(),
    })
    .from(pushNotifications)
    .where(where);

  return rows[0]?.count ?? 0;
}

async function enforceNotificationLimits(endpoint: string, jobKey: string) {
  const existingId = await getExistingNotificationId(endpoint, jobKey);
  if (existingId) return;

  const activeStatuses = or(
    eq(pushNotifications.status, "pending"),
    eq(pushNotifications.status, "sending"),
  );

  const [totalActive, endpointActive, delayActive] = await Promise.all([
    countActiveNotifications(activeStatuses),
    countActiveNotifications(and(activeStatuses, eq(pushNotifications.endpoint, endpoint))),
    isDelayUpdateJob(jobKey)
      ? countActiveNotifications(
          and(
            activeStatuses,
            eq(pushNotifications.endpoint, endpoint),
            like(pushNotifications.jobKey, `${DELAY_UPDATE_PREFIX}%`),
          ),
        )
      : Promise.resolve(0),
  ]);

  if (totalActive >= MAX_ACTIVE_NOTIFICATIONS) {
    throw new Error("Push queue is at capacity");
  }
  if (endpointActive >= MAX_ACTIVE_PER_ENDPOINT) {
    throw new Error("Push subscription has reached its pending limit");
  }
  if (isDelayUpdateJob(jobKey) && delayActive >= MAX_ACTIVE_DELAY_UPDATES_PER_ENDPOINT) {
    throw new Error("Too many pending delay updates for this subscription");
  }
}

async function upsertNotification(
  subscription: PushSubscription,
  notifyAt: number,
  nextAttemptAt: number,
  payload: PushPayload,
  jobKey: string,
) {
  const now = Date.now();
  const endpoint = subscription.endpoint;
  await enforceNotificationLimits(endpoint, jobKey);

  await pushDb
    .insert(pushNotifications)
    .values({
      id: toNotificationId(endpoint, jobKey),
      endpoint,
      jobKey,
      notifyAt,
      nextAttemptAt,
      subscriptionJson: JSON.stringify(subscription),
      payloadJson: JSON.stringify(payload),
      status: "pending",
      attemptCount: 0,
      claimedAt: null,
      sentAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [pushNotifications.endpoint, pushNotifications.jobKey],
      set: {
        notifyAt,
        nextAttemptAt,
        subscriptionJson: JSON.stringify(subscription),
        payloadJson: JSON.stringify(payload),
        status: "pending",
        attemptCount: 0,
        claimedAt: null,
        sentAt: null,
        lastError: null,
        updatedAt: now,
      },
    });
}

async function deleteNotificationsByEndpoint(endpoint: string) {
  await pushDb.delete(pushNotifications).where(eq(pushNotifications.endpoint, endpoint));
}

async function markSent(id: string) {
  const now = Date.now();
  await pushDb
    .update(pushNotifications)
    .set({
      status: "sent",
      sentAt: now,
      claimedAt: null,
      lastError: null,
      updatedAt: now,
    })
    .where(eq(pushNotifications.id, id));
}

async function markFailed(id: string, message: string) {
  const now = Date.now();
  await pushDb
    .update(pushNotifications)
    .set({
      status: "failed",
      claimedAt: null,
      lastError: message.slice(0, 500),
      updatedAt: now,
    })
    .where(eq(pushNotifications.id, id));
}

async function markRetry(id: string, attemptCount: number, message: string) {
  const now = Date.now();
  const backoffMs = Math.min(15 * 60_000, 60_000 * 2 ** Math.max(0, attemptCount - 1));

  await pushDb
    .update(pushNotifications)
    .set({
      status: "pending",
      claimedAt: null,
      nextAttemptAt: now + backoffMs,
      lastError: message.slice(0, 500),
      updatedAt: now,
    })
    .where(eq(pushNotifications.id, id));
}

async function claimDueNotifications(limit = MAX_BATCH_SIZE) {
  const now = Date.now();
  const staleBefore = now - CLAIM_STALE_MS;
  const rows = await pushDb
    .select()
    .from(pushNotifications)
    .where(
      or(
        and(
          eq(pushNotifications.status, "pending"),
          lte(pushNotifications.nextAttemptAt, now),
        ),
        and(
          eq(pushNotifications.status, "sending"),
          isNotNull(pushNotifications.claimedAt),
          lte(pushNotifications.claimedAt, staleBefore),
        ),
      ),
    )
    .orderBy(asc(pushNotifications.nextAttemptAt))
    .limit(limit);

  const claimed: ClaimedNotification[] = [];
  for (const row of rows) {
    const attemptCount = row.attemptCount + 1;
    await pushDb
      .update(pushNotifications)
      .set({
        status: "sending",
        attemptCount,
        claimedAt: now,
        updatedAt: now,
      })
      .where(eq(pushNotifications.id, row.id));

    claimed.push({
      id: row.id,
      endpoint: row.endpoint,
      attemptCount,
      subscriptionJson: row.subscriptionJson,
      payloadJson: row.payloadJson,
    });
  }

  return claimed;
}

async function pruneOldNotifications() {
  const now = Date.now();
  await pushDb
    .delete(pushNotifications)
    .where(
      or(
        and(
          eq(pushNotifications.status, "sent"),
          isNotNull(pushNotifications.sentAt),
          lte(pushNotifications.sentAt, now - PRUNE_SENT_AFTER_MS),
        ),
        and(
          eq(pushNotifications.status, "failed"),
          lte(pushNotifications.updatedAt, now - PRUNE_FAILED_AFTER_MS),
        ),
      ),
    );
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Failed to send push notification";
}

async function sendClaimedNotification(job: ClaimedNotification) {
  let subscription: PushSubscription;
  let payload: PushPayload;

  try {
    subscription = JSON.parse(job.subscriptionJson) as PushSubscription;
    payload = JSON.parse(job.payloadJson) as PushPayload;
  } catch {
    await markFailed(job.id, "Invalid stored push payload");
    return;
  }

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    await markSent(job.id);
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;

    if (statusCode === 404 || statusCode === 410) {
      await deleteNotificationsByEndpoint(job.endpoint);
      return;
    }

    if (job.attemptCount >= MAX_ATTEMPTS) {
      await markFailed(job.id, toErrorMessage(error));
      return;
    }

    await markRetry(job.id, job.attemptCount, toErrorMessage(error));
  }
}

export async function dispatchDueNotifications() {
  const state = getState();
  if (state.dispatching || !vapidPublicKey) return;

  await initializePushStore();

  state.dispatching = true;
  try {
    while (true) {
      const claimed = await claimDueNotifications();
      if (claimed.length === 0) break;

      for (const job of claimed) {
        await sendClaimedNotification(job);
      }

      if (claimed.length < MAX_BATCH_SIZE) break;
    }

    await pruneOldNotifications();
  } finally {
    state.dispatching = false;
  }
}

export function startPushScheduler() {
  const state = getState();
  if (state.started || !vapidPublicKey) return;

  state.started = true;
  void dispatchDueNotifications();
  state.intervalId = setInterval(() => {
    void dispatchDueNotifications();
  }, DISPATCH_INTERVAL_MS);
  state.intervalId.unref?.();
}

export async function scheduleNotification(
  subscription: PushSubscription,
  notifyAt: number,
  payload: PushPayload,
  jobKey = "default",
) {
  await initializePushStore();
  startPushScheduler();

  const now = Date.now();
  const nextAttemptAt = notifyAt <= now + IMMEDIATE_DISPATCH_WINDOW_MS ? now : notifyAt;
  await upsertNotification(subscription, notifyAt, nextAttemptAt, payload, jobKey);

  if (nextAttemptAt <= now) {
    await dispatchDueNotifications();
  }
}

export async function cancelNotification(endpoint: string, jobPrefix?: string) {
  await initializePushStore();
  startPushScheduler();

  if (!jobPrefix) {
    await deleteNotificationsByEndpoint(endpoint);
    return;
  }

  await pushDb
    .delete(pushNotifications)
    .where(
      and(
        eq(pushNotifications.endpoint, endpoint),
        like(pushNotifications.jobKey, `${jobPrefix}%`),
      ),
    );
}

export async function getPushDebugSnapshot(limit = 30, status?: string) {
  await initializePushStore();

  const safeLimit = Math.max(1, Math.min(limit, 100));
  const rows = await pushDb
    .select()
    .from(pushNotifications)
    .where(status ? eq(pushNotifications.status, status) : undefined)
    .orderBy(desc(pushNotifications.notifyAt))
    .limit(safeLimit);

  const allStatuses = await pushDb
    .select({
      status: pushNotifications.status,
    })
    .from(pushNotifications);

  const counts = allStatuses.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

  return {
    total: allStatuses.length,
    counts,
    rows: rows.map((row) => {
      let payload: PushPayload | null = null;
      try {
        payload = JSON.parse(row.payloadJson) as PushPayload;
      } catch {
        payload = null;
      }

      return {
        id: row.id,
        endpointSuffix: row.endpoint.slice(-48),
        jobKey: row.jobKey,
        status: row.status,
        attemptCount: row.attemptCount,
        notifyAt: row.notifyAt,
        nextAttemptAt: row.nextAttemptAt,
        claimedAt: row.claimedAt,
        sentAt: row.sentAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        lastError: row.lastError,
        payload: payload
          ? {
              title: payload.title,
              body: payload.body,
              tag: payload.tag,
              url: payload.url,
              category: payload.category,
              jobPrefix: payload.jobPrefix,
            }
          : null,
      };
    }),
  };
}

export const vapidPublicKey = VAPID_PUBLIC_KEY;
