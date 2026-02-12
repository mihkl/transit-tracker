import { NextRequest, NextResponse } from "next/server";
import { transitState } from "@/lib/server/transit-state";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  await transitState.initialize();

  const { searchParams } = request.nextUrl;
  const line = searchParams.get("line") || undefined;
  const type = searchParams.get("type") || undefined;

  const vehicles = transitState.getVehicles(line, type);

  return NextResponse.json({
    vehicles,
    count: vehicles.length,
    timestamp: new Date().toISOString(),
  });
}
