import { NextRequest, NextResponse } from "next/server";
import { scheduleNotification, cancelNotification, vapidPublicKey } from "@/server/push-scheduler";

export const dynamic = "force-dynamic";

const MAX_SCHEDULE_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_LEAD_MS = -5 * 60 * 1000;
const MAX_TEXT_LEN = 240;
const MAX_TAG_LEN = 80;
const MAX_URL_LEN = 500;
const MAX_CATEGORY_LEN = 80;
const MAX_JOB_KEY_LEN = 80;
const MAX_JOB_PREFIX_LEN = 80;
const MAX_ENDPOINT_LEN = 2000;

interface PushSubscriptionJson {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface PushScheduleBody {
  subscription: PushSubscriptionJson;
  notifyAt: number;
  title: string;
  body: string;
  tag?: string;
  url?: string;
  timestamp?: number;
  category?: string;
  jobKey?: string;
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

function toSafeString(value: unknown, maxLen: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

function parseScheduleBody(value: unknown): PushScheduleBody | null {
  if (!isObject(value)) return null;
  if (!isPushSubscriptionJson(value.subscription)) return null;

  const notifyAt = Number(value.notifyAt);
  if (!Number.isFinite(notifyAt)) return null;

  const title = toSafeString(value.title, MAX_TEXT_LEN);
  if (!title) return null;

  const body = toSafeString(value.body, MAX_TEXT_LEN) ?? "";
  const tag = toSafeString(value.tag, MAX_TAG_LEN);
  const url = toSafeString(value.url, MAX_URL_LEN);
  const category = toSafeString(value.category, MAX_CATEGORY_LEN);
  const jobKey = toSafeString(value.jobKey, MAX_JOB_KEY_LEN);

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

export function GET() {
  if (!vapidPublicKey) {
    return NextResponse.json({ error: "Push notifications are not configured" }, { status: 503 });
  }

  return new NextResponse(vapidPublicKey, {
    headers: { "Content-Type": "text/plain" },
  });
}

export async function POST(req: NextRequest) {
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

  const delay = body.notifyAt - Date.now();
  if (delay < MIN_LEAD_MS || delay > MAX_SCHEDULE_MS) {
    return NextResponse.json(
      { error: "notifyAt must be within the next 30 days" },
      { status: 400 },
    );
  }

  try {
    scheduleNotification(
      body.subscription,
      body.notifyAt,
      {
        title: body.title,
        body: body.body,
        tag: body.tag,
        url: body.url,
        timestamp: body.timestamp,
        category: body.category,
      },
      body.jobKey ?? "default",
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to schedule push";
    const status = msg.includes("limit") || msg.includes("capacity") ? 429 : 500;
    return NextResponse.json({ error: msg }, { status });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!isObject(rawBody)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const endpoint = toSafeString(rawBody.endpoint, MAX_ENDPOINT_LEN);
  const jobPrefix = toSafeString(rawBody.jobPrefix, MAX_JOB_PREFIX_LEN);

  if (!endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  cancelNotification(endpoint, jobPrefix);
  return NextResponse.json({ ok: true });
}
