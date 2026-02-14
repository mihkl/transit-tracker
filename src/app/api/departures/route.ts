import { NextRequest, NextResponse } from "next/server";
import { fetchStopDepartures } from "@/lib/server/siri-client";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const stopId = request.nextUrl.searchParams.get("stopId");

  if (!stopId) {
    return NextResponse.json(
      { error: "stopId parameter is required" },
      { status: 400 },
    );
  }

  const departures = await fetchStopDepartures(stopId);

  return NextResponse.json(departures);
}
