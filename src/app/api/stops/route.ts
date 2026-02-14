import { NextRequest, NextResponse } from "next/server";
import { transitState } from "@/lib/server/transit-state";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const routeKey = request.nextUrl.searchParams.get("routeKey");
  if (!routeKey) {
    return NextResponse.json(
      { error: "routeKey parameter is required" },
      { status: 400 },
    );
  }

  await transitState.initialize();
  const stops = transitState.getPatternStops(routeKey);
  return NextResponse.json(stops ?? []);
}
