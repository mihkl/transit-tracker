import { timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import { getHeapSnapshot, getHeapSpaceStatistics, getHeapStatistics } from "node:v8";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

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

function toMiB(bytes: number) {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

function getHeapSummary() {
  const memoryUsage = process.memoryUsage();
  const heapStats = getHeapStatistics();
  const spaces = getHeapSpaceStatistics().map((space) => ({
    name: space.space_name,
    usedBytes: space.space_used_size,
    sizeBytes: space.space_size,
    availableBytes: space.space_available_size,
    usedMiB: toMiB(space.space_used_size),
    sizeMiB: toMiB(space.space_size),
  }));

  return {
    pid: process.pid,
    uptimeSec: Math.round(process.uptime()),
    rssBytes: memoryUsage.rss,
    rssMiB: toMiB(memoryUsage.rss),
    heapTotalBytes: memoryUsage.heapTotal,
    heapTotalMiB: toMiB(memoryUsage.heapTotal),
    heapUsedBytes: memoryUsage.heapUsed,
    heapUsedMiB: toMiB(memoryUsage.heapUsed),
    externalBytes: memoryUsage.external,
    externalMiB: toMiB(memoryUsage.external),
    arrayBuffersBytes: memoryUsage.arrayBuffers,
    arrayBuffersMiB: toMiB(memoryUsage.arrayBuffers),
    heapSizeLimitBytes: heapStats.heap_size_limit,
    heapSizeLimitMiB: toMiB(heapStats.heap_size_limit),
    totalAvailableSizeBytes: heapStats.total_available_size,
    totalAvailableSizeMiB: toMiB(heapStats.total_available_size),
    totalHeapSizeExecutableBytes: heapStats.total_heap_size_executable,
    totalGlobalHandlesBytes: heapStats.total_global_handles_size,
    usedGlobalHandlesBytes: heapStats.used_global_handles_size,
    spaces,
  };
}

export async function GET(req: NextRequest) {
  if (!env.HEAP_DEBUG_TOKEN) {
    return NextResponse.json(
      { error: "Heap debug endpoint is not configured" },
      { status: 503 },
    );
  }

  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    summary: getHeapSummary(),
  });
}

export async function POST(req: NextRequest) {
  if (!env.HEAP_DEBUG_TOKEN) {
    return NextResponse.json(
      { error: "Heap debug endpoint is not configured" },
      { status: 503 },
    );
  }

  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  if (searchParams.get("gc") === "1" && typeof global.gc === "function") {
    global.gc();
  }

  const before = getHeapSummary();
  const snapshot = getHeapSnapshot();
  const filename = `heap-${Date.now()}-${process.pid}.heapsnapshot`;

  return new Response(Readable.toWeb(snapshot) as ReadableStream<Uint8Array>, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Heap-Rss-Mib": String(before.rssMiB),
      "X-Heap-Used-Mib": String(before.heapUsedMiB),
    },
  });
}
