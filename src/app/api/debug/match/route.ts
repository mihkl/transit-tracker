import { NextRequest, NextResponse } from "next/server";
import { transitState } from "@/lib/server/transit-state";
import { matchTransitLeg } from "@/lib/server/delay-matcher";

export const dynamic = "force-dynamic";

/**
 * Debug endpoint to inspect delay matching logic.
 *
 * GET /api/debug/match?line=45&type=BUS&depStop=Virve&depLat=X&depLng=Y&scheduled=2026-02-09T17:56:00Z&arrStop=Tehnikaülikool&arrLat=X&arrLng=Y
 */
export async function GET(request: NextRequest) {
  await transitState.initialize();

  const sp = request.nextUrl.searchParams;

  const result = await matchTransitLeg(
    sp.get("line") || undefined,
    sp.get("type") || undefined,
    sp.get("depStop") || undefined,
    sp.has("depLat") ? parseFloat(sp.get("depLat")!) : undefined,
    sp.has("depLng") ? parseFloat(sp.get("depLng")!) : undefined,
    sp.get("scheduled") || undefined,
    sp.get("arrStop") || undefined,
    sp.has("arrLat") ? parseFloat(sp.get("arrLat")!) : undefined,
    sp.has("arrLng") ? parseFloat(sp.get("arrLng")!) : undefined,
  );

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    query: {
      line: sp.get("line"),
      type: sp.get("type"),
      depStop: sp.get("depStop"),
      depLat: sp.get("depLat"),
      depLng: sp.get("depLng"),
      scheduled: sp.get("scheduled"),
      arrStop: sp.get("arrStop"),
      arrLat: sp.get("arrLat"),
      arrLng: sp.get("arrLng"),
    },
    result,
  });
}
