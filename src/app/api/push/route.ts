import { NextRequest, NextResponse } from "next/server";
import {
  scheduleNotification,
  cancelNotification,
  vapidPublicKey,
} from "@/lib/server/push-scheduler";

export const dynamic = "force-dynamic";

export function GET() {
  return new NextResponse(vapidPublicKey, {
    headers: { "Content-Type": "text/plain" },
  });
}

export async function POST(req: NextRequest) {
  const {
    subscription,
    notifyAt,
    title,
    body,
    tag,
    url,
    timestamp,
    category,
    jobKey,
  } = await req.json();
  if (!subscription?.endpoint || !notifyAt || !title) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  scheduleNotification(
    subscription,
    Number(notifyAt),
    {
      title: String(title),
      body: String(body ?? ""),
      tag: typeof tag === "string" ? tag : undefined,
      url: typeof url === "string" ? url : undefined,
      timestamp:
        typeof timestamp === "number" && Number.isFinite(timestamp)
          ? timestamp
          : undefined,
      category: typeof category === "string" ? category : undefined,
    },
    typeof jobKey === "string" && jobKey ? jobKey : "default",
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { endpoint, jobPrefix } = await req.json();
  if (!endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }
  cancelNotification(
    String(endpoint),
    typeof jobPrefix === "string" ? jobPrefix : undefined,
  );
  return NextResponse.json({ ok: true });
}
