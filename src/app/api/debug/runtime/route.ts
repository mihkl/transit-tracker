import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { transitState } from "@/server/transit-state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(req: NextRequest) {
  const token = env.HEAP_DEBUG_TOKEN;
  if (!token) return false;

  const bearer = req.headers.get("authorization");
  const headerToken = req.headers.get("x-heap-debug-token");
  const provided = bearer?.startsWith("Bearer ") ? bearer.slice(7).trim() : headerToken?.trim();
  if (!provided) return false;

  const expectedBuffer = Buffer.from(token);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function GET(req: NextRequest) {
  if (!env.HEAP_DEBUG_TOKEN) {
    return NextResponse.json(
      { error: "Runtime debug endpoint is not configured" },
      { status: 503 },
    );
  }

  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await transitState.initializeAsync();

  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    runtime: transitState.getDebugSnapshot(),
  });
}
