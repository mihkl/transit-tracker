"use server";

import { transitState } from "@/server/transit-state";
import { fetchStopDepartures } from "@/server/siri-client";
import type { StopDto, StopDeparture } from "@/lib/types";

const TALLINN_MIN_LAT = 59.35;
const TALLINN_MAX_LAT = 59.55;
const TALLINN_MIN_LNG = 24.55;
const TALLINN_MAX_LNG = 25.05;

let allStopsCache: StopDto[] | null = null;

function isInTallinnArea(lat: number, lng: number): boolean {
  return (
    lat >= TALLINN_MIN_LAT &&
    lat <= TALLINN_MAX_LAT &&
    lng >= TALLINN_MIN_LNG &&
    lng <= TALLINN_MAX_LNG
  );
}

function getStopTypeName(routeId: string): string {
  if (routeId.includes("_tram_")) return "tram";
  if (routeId.includes("_train_") || routeId.includes("_rail_")) return "train";
  return "bus";
}

export async function getAllStops(): Promise<StopDto[]> {
  if (allStopsCache) return allStopsCache;

  await transitState.initialize();
  const gtfs = transitState.getGtfs();
  if (!gtfs) throw new Error("GTFS not loaded");

  const stopLines = new Map<string, Set<string>>();
  for (const [, pattern] of gtfs.patterns) {
    const routeId = pattern.routeId;
    const route = gtfs.routes.get(routeId);
    if (!route) continue;
    const lineNumber = route.shortName;
    const type = getStopTypeName(routeId);
    const lineKey = lineNumber ? `${type[0].toUpperCase()}:${lineNumber}` : null;
    for (const stop of pattern.orderedStops) {
      if (!stopLines.has(stop.stopId)) stopLines.set(stop.stopId, new Set());
      if (lineKey) stopLines.get(stop.stopId)!.add(lineKey);
    }
  }

  const stops: StopDto[] = [];
  for (const stop of gtfs.stops.values()) {
    if (isInTallinnArea(stop.latitude, stop.longitude)) {
      const lines = stopLines.get(stop.stopId);
      stops.push({
        stopId: stop.stopId,
        stopName: stop.stopName,
        latitude: stop.latitude,
        longitude: stop.longitude,
        stopDesc: stop.stopDesc,
        stopArea: stop.stopArea,
        lines: lines ? Array.from(lines).sort() : undefined,
      });
    }
  }

  stops.sort((a, b) => a.stopName.localeCompare(b.stopName));
  allStopsCache = stops;
  return stops;
}

export async function getStopDepartures(stopId: string): Promise<StopDeparture[]> {
  return fetchStopDepartures(stopId);
}
