import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 30_000;

export async function GET() {
  // Use 'relative0' style (recommended by TomTom) - shows speed relative to free-flow
  const style = "relative0";

  const apiKey = process.env.TOMTOM_API_KEY;
  if (!apiKey) {
    console.error("[Traffic Flow API] ERROR: TomTom API key not configured");
    return NextResponse.json(
      { error: "TomTom API key not configured" },
      { status: 500 },
    );
  }

  const cacheKey = `flow:tileinfo:${style}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  const baseUrl = process.env.TOMTOM_BASE_URL || "https://api.tomtom.com";

  // Return tile URL template for MapLibre to use directly
  // thickness parameter is only supported for: absolute, relative, relative-delay, reduced-sensitivity
  const tileUrlTemplate = `${baseUrl}/traffic/map/4/tile/flow/${style}/{z}/{x}/{y}.png?key=${apiKey}`;

  const response = {
    tileUrlTemplate,
    attribution: "© TomTom",
    maxZoom: 22,
    minZoom: 0,
  };

  cache.set(cacheKey, { data: response, timestamp: Date.now() });

  return NextResponse.json(response);
}
