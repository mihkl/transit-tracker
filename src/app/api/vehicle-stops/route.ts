import { NextRequest, NextResponse } from "next/server";
import { transitState } from "@/lib/server/transit-state";
import { fetchStopDepartures } from "@/lib/server/siri-client";
import type { VehicleStopEta } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  await transitState.initialize();

  const vehicleId = request.nextUrl.searchParams.get("vehicleId");

  if (!vehicleId) {
    return NextResponse.json(
      { error: "vehicleId parameter is required" },
      { status: 400 },
    );
  }

  const vehicle = transitState.getVehicleById(parseInt(vehicleId, 10));
  if (!vehicle) {
    return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  }

  if (!vehicle.matchedRouteId || vehicle.matchedDirectionId === null) {
    return NextResponse.json([]);
  }

  const routeKey = `${vehicle.matchedRouteId}_${vehicle.matchedDirectionId}`;
  const patternStops = transitState.getPatternStops(routeKey);
  if (!patternStops || patternStops.length === 0) {
    return NextResponse.json([]);
  }

  const currentStopIdx = Math.max(0, vehicle.lastStopIndex);
  const upcomingStops = patternStops.slice(currentStopIdx, currentStopIdx + 6);

  const etas: VehicleStopEta[] = [];

  for (const stop of upcomingStops) {
    const isPassed = stop.distAlongRoute <= vehicle.distanceAlongRoute;

    let expectedArrivalSeconds: number | null = null;
    let scheduledArrivalSeconds: number | null = null;
    let delaySeconds: number | null = null;

    if (!isPassed) {
      try {
        const departures = await fetchStopDepartures(stop.stopId);
        const match = departures.find(
          (d) =>
            d.route === vehicle.lineNumber &&
            d.destination === vehicle.destination,
        );
        if (match) {
          expectedArrivalSeconds = match.secondsUntilArrival;
          scheduledArrivalSeconds =
            match.secondsUntilArrival - match.delaySeconds;
          delaySeconds = match.delaySeconds;
        }
      } catch {
        continue;
      }
    }

    etas.push({
      stopId: stop.stopId,
      stopName: stop.stopName,
      latitude: stop.latitude,
      longitude: stop.longitude,
      expectedArrivalSeconds,
      scheduledArrivalSeconds,
      delaySeconds,
      isPassed,
    });
  }

  return NextResponse.json(etas);
}
