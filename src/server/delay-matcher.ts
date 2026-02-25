import type { DelayInfo, PatternStop } from "@/lib/types";
import type { DelayStatus, LineType, TransitMode } from "@/lib/domain";
import { normalizeLineType } from "@/lib/domain";
import { haversineDistance } from "./geo-utils";
import { transitState } from "./transit-state";
import { fetchStopArrivals } from "./siri-client";
import { getSecondsOfDayInTallinn } from "./time-utils";

interface MatchedStopInfo {
  stopId: string;
  directionId: number | null;
  terminalStopName: string | null;
}

interface DepartureTimeTarget {
  kind: "epoch" | "seconds_of_day";
  value: number;
}

// Tallinn stop-board RT feed is short-horizon. Avoid claiming precise live delay
// for far-future departures where data is typically unavailable.
const LIVE_DELAY_LOOKAHEAD_MS = 60 * 60 * 1000;

export function matchTransitLeg(
  lineNumber: string | undefined,
  vehicleType: TransitMode | undefined,
  departureStopName: string | undefined,
  departureStopLat: number | undefined,
  departureStopLng: number | undefined,
  scheduledDepartureTime: string | undefined,
  arrivalStopName?: string,
  arrivalStopLat?: number,
  arrivalStopLng?: number,
): Promise<DelayInfo | null> {
  return matchTransitLegAsync(
    lineNumber,
    vehicleType,
    departureStopName,
    departureStopLat,
    departureStopLng,
    scheduledDepartureTime,
    arrivalStopName,
    arrivalStopLat,
    arrivalStopLng,
  );
}

async function matchTransitLegAsync(
  lineNumber: string | undefined,
  vehicleType: TransitMode | undefined,
  departureStopName: string | undefined,
  departureStopLat: number | undefined,
  departureStopLng: number | undefined,
  scheduledDepartureTime: string | undefined,
  arrivalStopName?: string,
  arrivalStopLat?: number,
  arrivalStopLng?: number,
): Promise<DelayInfo | null> {
  if (!lineNumber) return null;
  if (!isWithinLiveDelayWindow(scheduledDepartureTime)) return null;

  let typeFilter: LineType | undefined;
  switch (vehicleType?.toUpperCase()) {
    case "BUS":
      typeFilter = normalizeLineType("bus");
      break;
    case "TRAM":
      typeFilter = normalizeLineType("tram");
      break;
    case "TROLLEYBUS":
      typeFilter = normalizeLineType("trolleybus");
      break;
  }

  const stopInfo = findDepartureStopInfo(
    lineNumber,
    typeFilter,
    departureStopName,
    departureStopLat,
    departureStopLng,
    arrivalStopName,
    arrivalStopLat,
    arrivalStopLng,
  );

  if (!stopInfo) return null;

  try {
    const siriStopId = resolveSiriStopId(stopInfo.stopId);
    if (!siriStopId) return null;
    const departures = await fetchStopArrivals(siriStopId);

    const sameLine = departures.filter((d) => routeMatches(d.route, lineNumber));
    if (sameLine.length === 0) return null;

    const directionFiltered = filterByDirection(sameLine, stopInfo.terminalStopName);
    const target = buildTimeTarget(scheduledDepartureTime, directionFiltered);
    const match = pickBestDeparture(directionFiltered, target);
    if (!match) return null;

    const delaySeconds = match.delaySeconds;
    let status: DelayStatus;
    if (Math.abs(delaySeconds) < 30) status = "on_time";
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

// This function assumes that the stop IDs stored in the GTFS data (produced by
// build-gtfs.js) match the numeric IDs expected by the SIRI stop-departures
// endpoint. build-gtfs.js sets stop_id = SiriID from stops.txt, so the two ID
// spaces are equivalent. The only normalization needed is stripping any
// "feed:id" prefix that a GTFS feed loader may have prepended.
function resolveSiriStopId(fallbackStopId: string): string | null {
  const normalized = normalizeStopId(fallbackStopId);
  return normalized.length > 0 ? normalized : null;
}

function normalizeStopId(stopId: string): string {
  const value = String(stopId ?? "").trim();
  if (!value) return "";
  if (value.includes(":")) {
    const tail = value.split(":").pop()?.trim();
    return tail || value;
  }
  return value;
}

function findDepartureStopInfo(
  lineNumber: string,
  typeFilter: LineType | undefined,
  departureStopName: string | undefined,
  departureStopLat: number | undefined,
  departureStopLng: number | undefined,
  arrivalStopName?: string,
  arrivalStopLat?: number,
  arrivalStopLng?: number,
): MatchedStopInfo | null {
  const routeId = transitState.getRouteIdForLine(lineNumber, typeFilter);
  if (!routeId) return null;

  let fallback: MatchedStopInfo | null = null;

  for (let dir = 0; dir <= 1; dir++) {
    const key = `${routeId}_${dir}`;
    const stops = transitState.getPatternStops(key);
    if (!stops || stops.length === 0) continue;

    const depIdx = findStopInPattern(stops, departureStopName, departureStopLat, departureStopLng);
    if (depIdx < 0) continue;

    const candidate: MatchedStopInfo = {
      stopId: stops[depIdx].stopId,
      directionId: dir,
      terminalStopName: stops[stops.length - 1]?.stopName ?? null,
    };

    if (!fallback) fallback = candidate;

    if (arrivalStopName || arrivalStopLat != null) {
      const arrIdx = findStopInPattern(stops, arrivalStopName, arrivalStopLat, arrivalStopLng);
      if (arrIdx > depIdx) return candidate;
    } else {
      return candidate;
    }
  }

  if (fallback) return fallback;

  if (departureStopLat != null && departureStopLng != null) {
    const stopId = transitState.getStopIdByCoords(departureStopLat, departureStopLng);
    if (stopId) {
      return {
        stopId,
        directionId: null,
        terminalStopName: null,
      };
    }
  }

  return null;
}

function findStopInPattern(
  stops: PatternStop[],
  stopName: string | undefined,
  lat: number | undefined,
  lng: number | undefined,
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
      const dist = haversineDistance(lat, lng, stops[i].latitude, stops[i].longitude);
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

function routeMatches(route: string, lineNumber: string): boolean {
  const a = normalizeRoute(route);
  const b = normalizeRoute(lineNumber);
  return a === b;
}

function normalizeRoute(value: string): string {
  const clean = String(value).trim().toLowerCase().replace(/\s+/g, "");
  return clean.replace(/^0+/, "");
}

function filterByDirection<T extends { destination: string }>(
  departures: T[],
  terminalStopName: string | null,
): T[] {
  if (!terminalStopName) return departures;
  const terminal = normalizeText(terminalStopName);
  const filtered = departures.filter((d) => {
    const dest = normalizeText(d.destination);
    return !!dest && (dest.includes(terminal) || terminal.includes(dest));
  });
  return filtered.length > 0 ? filtered : departures;
}

function normalizeText(value: string | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTimeTarget<T extends { scheduleTime: number }>(
  scheduledDepartureTime: string | undefined,
  departures: T[],
): DepartureTimeTarget | null {
  if (!scheduledDepartureTime) return null;

  const date = new Date(scheduledDepartureTime);
  if (Number.isNaN(date.getTime())) return null;

  const usesSecondsOfDay = departures.some((d) => isSecondsOfDay(d.scheduleTime));

  if (usesSecondsOfDay) {
    return {
      kind: "seconds_of_day",
      value: getSecondsOfDayInTallinn(date),
    };
  }

  return {
    kind: "epoch",
    value: Math.floor(date.getTime() / 1000),
  };
}

function isSecondsOfDay(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value < 172_800;
}


function pickBestDeparture<T extends { scheduleTime: number }>(
  departures: T[],
  target: DepartureTimeTarget | null,
): T | null {
  if (departures.length === 0) return null;
  if (!target) return departures[0];

  const sorted = [...departures].sort((a, b) => {
    const da = departureDistance(a.scheduleTime, target);
    const db = departureDistance(b.scheduleTime, target);
    return da - db;
  });

  return sorted[0];
}

function departureDistance(scheduleTime: number, target: DepartureTimeTarget): number {
  if (!Number.isFinite(scheduleTime)) return Number.POSITIVE_INFINITY;

  if (target.kind === "seconds_of_day" && isSecondsOfDay(scheduleTime)) {
    const raw = Math.abs(scheduleTime - target.value);
    return Math.min(raw, 86_400 - raw);
  }

  return Math.abs(scheduleTime - target.value);
}

function isWithinLiveDelayWindow(scheduledDepartureTime: string | undefined): boolean {
  if (!scheduledDepartureTime) return true;
  const scheduledMs = Date.parse(scheduledDepartureTime);
  if (Number.isNaN(scheduledMs)) return true;
  return scheduledMs - Date.now() <= LIVE_DELAY_LOOKAHEAD_MS;
}
