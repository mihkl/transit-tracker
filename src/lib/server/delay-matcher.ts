import type { DelayInfo, PatternStop } from "@/lib/types";
import { haversineDistance } from "./geo-utils";
import { transitState } from "./transit-state";
import { fetchStopDepartures } from "./siri-client";

export interface MatchDebugInfo {
  lineNumber: string;
  typeFilter?: string;
  routeId: string | null;
  directionId: number | null;
  stopId: string | null;
  result: DelayInfo | null;
}

export function matchTransitLeg(
  lineNumber: string | undefined,
  vehicleType: string | undefined,
  departureStopName: string | undefined,
  departureStopLat: number | undefined,
  departureStopLng: number | undefined,
  scheduledDepartureTime: string | undefined,
  arrivalStopName?: string,
  arrivalStopLat?: number,
  arrivalStopLng?: number
): Promise<DelayInfo | null> {
  return matchTransitLegAsync(
    lineNumber, vehicleType,
    departureStopName, departureStopLat, departureStopLng,
    scheduledDepartureTime,
    arrivalStopName, arrivalStopLat, arrivalStopLng
  );
}

async function matchTransitLegAsync(
  lineNumber: string | undefined,
  vehicleType: string | undefined,
  departureStopName: string | undefined,
  departureStopLat: number | undefined,
  departureStopLng: number | undefined,
  scheduledDepartureTime: string | undefined,
  arrivalStopName?: string,
  arrivalStopLat?: number,
  arrivalStopLng?: number
): Promise<DelayInfo | null> {
  if (!lineNumber) return null;

  let typeFilter: string | undefined;
  switch (vehicleType?.toUpperCase()) {
    case "BUS":
      typeFilter = "bus";
      break;
    case "TRAM":
      typeFilter = "tram";
      break;
    case "TROLLEYBUS":
      typeFilter = "trolleybus";
      break;
  }

  // Find the departure stop's GTFS stopId
  const stopId = findDepartureStopId(
    lineNumber, typeFilter,
    departureStopName, departureStopLat, departureStopLng,
    arrivalStopName, arrivalStopLat, arrivalStopLng
  );

  if (!stopId) return null;

  // Fetch SIRI departures for that stop
  try {
    const departures = await fetchStopDepartures(stopId);

    // Find matching departure: same route number
    const match = departures.find((d) => d.route === lineNumber);
    if (!match) return null;

    const delaySeconds = match.delaySeconds;
    let status: string;
    if (Math.abs(delaySeconds) < 90) status = "on_time";
    else if (delaySeconds > 0) status = "delayed";
    else status = "early";

    return {
      estimatedDelaySeconds: delaySeconds,
      status,
    };
  } catch {
    return null;
  }
}

function findDepartureStopId(
  lineNumber: string,
  typeFilter: string | undefined,
  departureStopName: string | undefined,
  departureStopLat: number | undefined,
  departureStopLng: number | undefined,
  arrivalStopName?: string,
  arrivalStopLat?: number,
  arrivalStopLng?: number
): string | null {
  const routeId = transitState.getRouteIdForLine(lineNumber, typeFilter);
  if (!routeId) return null;

  // Try to find the stop in the route pattern
  for (let dir = 0; dir <= 1; dir++) {
    const key = `${routeId}_${dir}`;
    const stops = transitState.getPatternStops(key);
    if (!stops || stops.length === 0) continue;

    const depIdx = findStopInPattern(
      stops, departureStopName, departureStopLat, departureStopLng
    );
    if (depIdx < 0) continue;

    // Verify direction if we have arrival stop info
    if (arrivalStopName || arrivalStopLat != null) {
      const arrIdx = findStopInPattern(
        stops, arrivalStopName, arrivalStopLat, arrivalStopLng
      );
      if (arrIdx > depIdx) return stops[depIdx].stopId;
    } else {
      return stops[depIdx].stopId;
    }
  }

  // Fallback: find by coordinates
  if (departureStopLat != null && departureStopLng != null) {
    return transitState.getStopIdByCoords(departureStopLat, departureStopLng);
  }

  return null;
}

function findStopInPattern(
  stops: PatternStop[],
  stopName: string | undefined,
  lat: number | undefined,
  lng: number | undefined
): number {
  let bestIdx = -1;
  let bestDist = Infinity;

  for (let i = 0; i < stops.length; i++) {
    let nameMatch = false;
    let geoMatch = false;

    if (stopName && stops[i].stopName) {
      const a = stopName.toLowerCase();
      const b = stops[i].stopName.toLowerCase();
      nameMatch = a.includes(b) || b.includes(a);
    }

    if (lat != null && lng != null) {
      const dist = haversineDistance(
        lat,
        lng,
        stops[i].latitude,
        stops[i].longitude
      );
      if (dist < 100) {
        geoMatch = true;
        if (dist < bestDist && (nameMatch || !stopName)) {
          bestDist = dist;
          bestIdx = i;
        }
      }
    }

    if (nameMatch && geoMatch) return i;

    if (nameMatch && lat == null && bestIdx < 0) bestIdx = i;
  }

  return bestIdx;
}
