import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getClientIdentifier } from "@/lib/request-client";
import { cancelNotification, scheduleNotification, vapidPublicKey } from "@/server/push-scheduler";
import { LEAVE_MAIN_JOB_KEY, LEAVE_MAIN_SNOOZE_PREFIX, DELAY_UPDATE_PREFIX } from "@/lib/push-constants";

export const dynamic = "force-dynamic";

const MAX_SCHEDULE_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_LEAD_MS = -5 * 60 * 1000;
const MAX_TEXT_LEN = 240;
const MAX_TAG_LEN = 80;
const MAX_URL_LEN = 500;
const MAX_CATEGORY_LEN = 80;
const MAX_JOB_KEY_LEN = 80;
const MAX_ENDPOINT_LEN = 2000;

interface PushSubscriptionJson {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isPushSubscriptionJson(value: unknown): value is PushSubscriptionJson {
  if (!isObject(value)) return false;
  if (typeof value.endpoint !== "string" || value.endpoint.length === 0) return false;
  if (value.endpoint.length > MAX_ENDPOINT_LEN) return false;

  const keys = value.keys;
  if (!isObject(keys)) return false;

  return (
    typeof keys.p256dh === "string" &&
    keys.p256dh.length > 0 &&
    typeof keys.auth === "string" &&
    keys.auth.length > 0
  );
}

function toSafeString(value: unknown, maxLen: number) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

function toSafeAppPath(value: unknown) {
  const path = toSafeString(value, MAX_URL_LEN);
  if (!path) return undefined;
  if (!path.startsWith("/") || path.startsWith("//")) return undefined;
  return path;
}

function toSafeJobKey(value: unknown) {
  const key = toSafeString(value, MAX_JOB_KEY_LEN);
  if (!key) return null;
  if (key === LEAVE_MAIN_JOB_KEY) return key;
  if (key.startsWith(LEAVE_MAIN_SNOOZE_PREFIX)) {
    return /^leave-main-snooze-\d+$/.test(key) ? key : null;
  }
  if (key.startsWith(DELAY_UPDATE_PREFIX)) {
    return /^delay-update-\d+$/.test(key) ? key : null;
  }
  return null;
}

function toSafeJobPrefix(value: unknown) {
  const prefix = toSafeString(value, MAX_JOB_KEY_LEN);
  if (!prefix) return undefined;
  if (prefix === LEAVE_MAIN_JOB_KEY || prefix === DELAY_UPDATE_PREFIX) return prefix;
  return undefined;
}

function toJobPrefix(jobKey: string) {
  return jobKey.startsWith(DELAY_UPDATE_PREFIX) ? DELAY_UPDATE_PREFIX : LEAVE_MAIN_JOB_KEY;
}

function parseScheduleBody(value: unknown) {
  if (!isObject(value)) return null;
  if (!isPushSubscriptionJson(value.subscription)) return null;

  const notifyAt = Number(value.notifyAt);
  if (!Number.isFinite(notifyAt)) return null;

  const title = toSafeString(value.title, MAX_TEXT_LEN);
  if (!title) return null;

  const body = toSafeString(value.body, MAX_TEXT_LEN) ?? "";
  const tag = toSafeString(value.tag, MAX_TAG_LEN);
  const url = toSafeAppPath(value.url);
  const category = toSafeString(value.category, MAX_CATEGORY_LEN);
  const jobKey = toSafeJobKey(value.jobKey);
  if (!jobKey) return null;

  const timestamp =
    typeof value.timestamp === "number" && Number.isFinite(value.timestamp)
      ? value.timestamp
      : undefined;

  return {
    subscription: value.subscription,
    notifyAt,
    title,
    body,
    tag,
    url,
    timestamp,
    category,
    jobKey,
  };
}

function getRequestOrigin(req: NextRequest) {
  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  if (!origin) return null;
  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
}

function isAllowedOrigin(req: NextRequest) {
  const requestOrigin = getRequestOrigin(req);
  if (!requestOrigin) return env.NODE_ENV !== "production";

  if (env.APP_ORIGIN) {
    return requestOrigin === env.APP_ORIGIN;
  }

  return env.NODE_ENV !== "production" && requestOrigin === req.nextUrl.origin;
}

export function GET() {
  if (!vapidPublicKey) {
    return NextResponse.json({ error: "Push notifications are not configured" }, { status: 503 });
  }

  return new NextResponse(vapidPublicKey, {
    headers: { "Content-Type": "text/plain" },
  });
}

export async function POST(req: NextRequest) {
  if (!isAllowedOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!vapidPublicKey) {
    return NextResponse.json({ error: "Push notifications are not configured" }, { status: 503 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const body = parseScheduleBody(rawBody);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const requester = getClientIdentifier(req.headers);
  const limit = await consumeRateLimit("push-write", `push:${requester}`);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many push requests. Please wait a moment." },
      {
        status: 429,
        headers: {
          "Retry-After": String(limit.retryAfterSec),
        },
      },
    );
  }

  const delay = body.notifyAt - Date.now();
  if (delay < MIN_LEAD_MS || delay > MAX_SCHEDULE_MS) {
    return NextResponse.json(
      { error: "notifyAt must be within the next 30 days" },
      { status: 400 },
    );
  }

  try {
    await scheduleNotification(
      body.subscription,
      body.notifyAt,
      {
        title: body.title,
        body: body.body,
        tag: body.tag,
        url: body.url,
        timestamp: body.timestamp,
        category: body.category,
        jobPrefix: toJobPrefix(body.jobKey),
      },
      body.jobKey,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to schedule push";
    const status = msg.includes("limit") || msg.includes("capacity") ? 429 : 500;
    return NextResponse.json(
      { error: msg },
      status === 429 ? { status, headers: { "Retry-After": "60" } } : { status },
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!isAllowedOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!isObject(rawBody)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const subscription = isPushSubscriptionJson(rawBody.subscription)
    ? rawBody.subscription
    : null;
  const jobPrefix = toSafeJobPrefix(rawBody.jobPrefix);

  if (!subscription || subscription.endpoint.length > MAX_ENDPOINT_LEN) {
    return NextResponse.json({ error: "Missing subscription" }, { status: 400 });
  }

  const requester = getClientIdentifier(req.headers);
  const limit = await consumeRateLimit("push-delete", `push-delete:${requester}`);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many push cancellation requests. Please wait a moment." },
      {
        status: 429,
        headers: {
          "Retry-After": String(limit.retryAfterSec),
        },
      },
    );
  }

  await cancelNotification(subscription.endpoint, jobPrefix);
  return NextResponse.json({ ok: true });
}
