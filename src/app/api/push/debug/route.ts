import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getPushDebugSnapshot } from "@/server/push-scheduler";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest) {
  const token = env.PUSH_DEBUG_TOKEN;
  if (!token) return false;

  const bearer = req.headers.get("authorization");
  const headerToken = req.headers.get("x-push-debug-token");
  const provided = bearer?.startsWith("Bearer ") ? bearer.slice(7).trim() : headerToken?.trim();
  if (!provided) return false;

  const expectedBuffer = Buffer.from(token);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function GET(req: NextRequest) {
  if (!env.PUSH_DEBUG_TOKEN) {
    return NextResponse.json(
      { error: "Push debug endpoint is not configured" },
      { status: 503 },
    );
  }

  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const limitParam = Number(searchParams.get("limit") ?? "30");
  const limit = Number.isFinite(limitParam) ? limitParam : 30;
  const status = searchParams.get("status")?.trim() || undefined;

  const snapshot = await getPushDebugSnapshot(limit, status);
  return NextResponse.json({
    ok: true,
    now: Date.now(),
    ...snapshot,
  });
}
