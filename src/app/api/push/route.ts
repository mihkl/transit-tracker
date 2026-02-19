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
  const { subscription, notifyAt, title, body } = await req.json();
  if (!subscription?.endpoint || !notifyAt || !title) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  scheduleNotification(
    subscription,
    Number(notifyAt),
    String(title),
    String(body ?? ""),
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { endpoint } = await req.json();
  if (!endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }
  cancelNotification(String(endpoint));
  return NextResponse.json({ ok: true });
}
