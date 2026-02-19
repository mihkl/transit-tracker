import { NextRequest, NextResponse } from "next/server";
import { matchTransitLeg } from "@/lib/server/delay-matcher";
import { transitState } from "@/lib/server/transit-state";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  await transitState.initialize();

  const p = request.nextUrl.searchParams;
  const line = p.get("line") ?? undefined;
  const type = p.get("type") ?? undefined;
  const depStop = p.get("depStop") ?? undefined;
  const depLat = p.get("depLat") ? parseFloat(p.get("depLat")!) : undefined;
  const depLng = p.get("depLng") ? parseFloat(p.get("depLng")!) : undefined;
  const arrStop = p.get("arrStop") ?? undefined;
  const arrLat = p.get("arrLat") ? parseFloat(p.get("arrLat")!) : undefined;
  const arrLng = p.get("arrLng") ? parseFloat(p.get("arrLng")!) : undefined;
  const scheduledDep = p.get("scheduledDep") ?? undefined;

  const delay = await matchTransitLeg(
    line,
    type,
    depStop,
    depLat,
    depLng,
    scheduledDep,
    arrStop,
    arrLat,
    arrLng,
  );

  return NextResponse.json(delay ?? null);
}
