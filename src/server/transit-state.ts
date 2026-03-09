import type {
  GpsReading,
  GtfsData,
  GtfsStop,
  RoutePattern,
  VehicleState,
} from "@/lib/types";
import type { LineType, TypeFilter } from "@/lib/domain";
import { env } from "@/lib/env";
import { normalizeLineType, GPS_TYPE_TO_TRANSPORT, LINE_TYPE_TO_GPS_TYPES } from "@/lib/domain";
import { lineDtoSchema, vehicleDtoSchema } from "@/lib/schemas";
import { captureUnexpectedError } from "@/lib/monitoring";
import { loadGtfs } from "./gtfs-loader";
import { VehicleTracker } from "./vehicle-tracker";
import { GpsPollerService } from "./gps-poller";
import { haversineDistance } from "./geo-utils";

const GPS_POLL_INTERVAL_MS = 10_000;
const STOP_MATCH_RADIUS_M = 200;
const ACTIVE_ROUTE_MAX_OFFSET_M = 120;
const GRID_CELL_DEG = 0.01;

const GTFS_ROUTE_TYPE = {
  TRAM: 0,
  RAIL: 2,
  BUS: 3,
  TROLLEYBUS: 800,
} as const;

type StopGrid = Map<string, { stopId: string; lat: number; lng: number }[]>;

function getTransportTypes(typeFilter: LineType) {
  return new Set(LINE_TYPE_TO_GPS_TYPES[typeFilter] ?? LINE_TYPE_TO_GPS_TYPES.all);
}

function getTypeNameFromGps(transportType: number) {
  return GPS_TYPE_TO_TRANSPORT[transportType] ?? "unknown";
}

function gtfsRouteTypeToName(routeType: number) {
  switch (routeType) {
    case GTFS_ROUTE_TYPE.TRAM:        return normalizeLineType("tram");
    case GTFS_ROUTE_TYPE.RAIL:        return normalizeLineType("train");
    case GTFS_ROUTE_TYPE.TROLLEYBUS:  return normalizeLineType("trolleybus");
    case GTFS_ROUTE_TYPE.BUS:
    default:                          return normalizeLineType("bus");
  }
}

function gridKey(lat: number, lng: number) {
  return `${Math.floor(lat / GRID_CELL_DEG)}_${Math.floor(lng / GRID_CELL_DEG)}`;
}

function buildStopGrid(stops: Map<string, GtfsStop>) {
  const grid: StopGrid = new Map();
  for (const stop of stops.values()) {
    const key = gridKey(stop.latitude, stop.longitude);
    let cell = grid.get(key);
    if (!cell) {
      cell = [];
      grid.set(key, cell);
    }
    cell.push({ stopId: stop.stopId, lat: stop.latitude, lng: stop.longitude });
  }
  return grid;
}

function findNearestStop(grid: StopGrid, lat: number, lng: number, maxDist: number) {
  const cellRow = Math.floor(lat / GRID_CELL_DEG);
  const cellCol = Math.floor(lng / GRID_CELL_DEG);
  let bestId: string | null = null;
  let bestDist = Infinity;

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const cell = grid.get(`${cellRow + dr}_${cellCol + dc}`);
      if (!cell) continue;
      for (const stop of cell) {
        const dist = haversineDistance(lat, lng, stop.lat, stop.lng);
        if (dist < bestDist) {
          bestDist = dist;
          bestId = stop.stopId;
        }
      }
    }
  }

  return bestDist < maxDist ? bestId : null;
}

function computeNextStop(pattern: RoutePattern | null, v: VehicleState) {
  if (!pattern) return null;
  const nextIdx = v.lastStopIndex + 1;
  if (nextIdx >= pattern.orderedStops.length) return null;

  const nextStop = pattern.orderedStops[nextIdx];
  const dist = Math.max(0, nextStop.distAlongRoute - v.distanceAlongRoute);

  return {
    stopId: nextStop.stopId,
    name: nextStop.stopName,
    latitude: nextStop.latitude,
    longitude: nextStop.longitude,
    distanceMeters: Math.round(dist),
  };
}


class TransitState {
  private gtfs: GtfsData | null = null;
  private tracker: VehicleTracker | null = null;
  private poller: GpsPollerService | null = null;
  private shapesCache: Record<string, number[][]> | null = null;
  private stopGrid: StopGrid | null = null;
  private initialized = false;
  private initializing = false;
  private updateCallbacks: Set<() => void> = new Set();

  async initializeAsync() {
    if (this.initialized || this.initializing) return;
    this.initializing = true;

    try {
      this.gtfs = loadGtfs();
      this.stopGrid = buildStopGrid(this.gtfs.stops);
      this.tracker = new VehicleTracker(this.gtfs);

      this.poller = new GpsPollerService((readings) => {
        this.processReadings(readings);
      }, GPS_POLL_INTERVAL_MS);
      this.poller.start();

      this.initialized = true;
      console.log("GTFS loaded, GPS poller started.");
    } catch (err) {
      this.initializing = false;
      captureUnexpectedError(err, { area: "transit-state" });
      throw err;
    }
  }

  isReady() {
    return this.initialized;
  }

  onUpdate(callback: () => void) {
    this.updateCallbacks.add(callback);
    return () => this.updateCallbacks.delete(callback);
  }

  private notifyUpdate() {
    for (const cb of this.updateCallbacks) {
      try {
        cb();
      } catch (err) {
        captureUnexpectedError(err, { area: "transit-state", extra: { phase: "notify-update" } });
      }
    }
  }

  private processReadings(readings: GpsReading[]) {
    if (!this.tracker) return;
    this.tracker.processReadings(readings);
    this.notifyUpdate();
  }

  getGtfs() {
    return this.gtfs;
  }

  getVehicles(lineFilter?: string, typeFilter?: TypeFilter) {
    if (!this.tracker || !this.gtfs) return [];

    let vehicles = Array.from(this.tracker.getVehicles().values());

    if (typeFilter && typeFilter !== "all") {
      const types = getTransportTypes(typeFilter);
      vehicles = vehicles.filter((v) => types.has(v.transportType));
    }

    if (lineFilter) {
      vehicles = vehicles.filter((v) => v.lineNumber === lineFilter);
    }

    return vehicles.map((v) => this.toDto(v));
  }

  getVehicleById(id: string) {
    if (!this.tracker) return null;
    return this.tracker.getVehicles().get(id) ?? null;
  }

  getLines() {
    if (!this.gtfs) return [];

    return Array.from(this.gtfs.routes.values())
      .map((r) =>
        lineDtoSchema.parse({
          lineNumber: r.shortName,
          type: gtfsRouteTypeToName(r.routeType),
          routeId: r.routeId,
        }),
      )
      .sort((a, b) => {
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        const an = parseInt(a.lineNumber, 10) || 0;
        const bn = parseInt(b.lineNumber, 10) || 0;
        if (an !== bn) return an - bn;
        return a.lineNumber.localeCompare(b.lineNumber);
      });
  }

  getShapes() {
    if (!this.gtfs) return null;
    if (this.shapesCache) return this.shapesCache;

    this.shapesCache = {};
    for (const [key, pattern] of this.gtfs.patterns) {
      this.shapesCache[key] = pattern.shapePoints.map((p) => [
        p.latitude,
        p.longitude,
        p.distTraveled,
      ]);
    }
    return this.shapesCache;
  }

  getPatternStops(routeKey: string) {
    if (!routeKey || !this.gtfs) return null;

    const pattern = this.gtfs.patterns.get(routeKey);
    return pattern?.orderedStops ?? null;
  }

  getRouteIdForLine(lineNumber: string, typeFilter?: LineType) {
    if (!this.gtfs) return null;
    const typeNums = LINE_TYPE_TO_GPS_TYPES[typeFilter ?? "all"];
    for (const t of typeNums) {
      const routeId = this.gtfs.gpsToRouteMap.get(`${t}_${lineNumber}`);
      if (routeId) return routeId;
    }
    return null;
  }

  getStopIdByCoords(lat: number, lng: number) {
    if (!this.stopGrid) return null;
    return findNearestStop(this.stopGrid, lat, lng, STOP_MATCH_RADIUS_M);
  }

  private toDto(v: VehicleState) {
    const routeKey =
      v.matchedRouteId !== null && v.matchedDirectionId !== null
        ? `${v.matchedRouteId}_${v.matchedDirectionId}`
        : null;
    const pattern = routeKey ? this.gtfs?.patterns.get(routeKey) ?? null : null;
    const routeOffsetMeters =
      typeof v.routeOffsetMeters === "number" ? Math.round(v.routeOffsetMeters) : null;
    const isOnRoute =
      routeKey !== null &&
      routeOffsetMeters !== null &&
      routeOffsetMeters <= ACTIVE_ROUTE_MAX_OFFSET_M;

    const dto = vehicleDtoSchema.parse({
      id: v.id,
      lineNumber: v.lineNumber,
      transportType: getTypeNameFromGps(v.transportType),
      latitude: v.latitude,
      longitude: v.longitude,
      heading: v.heading,
      bearing: v.heading,
      destination: v.destination,
      directionId: v.matchedDirectionId ?? 0,
      stopIndex: v.lastStopIndex,
      totalStops: pattern?.orderedStops.length ?? 0,
      nextStop: computeNextStop(pattern, v),
      distanceAlongRoute: Math.round(v.distanceAlongRoute * 10) / 10,
      routeKey,
      routeOffsetMeters,
      isOnRoute,
    });

    return dto;
  }
}

const globalForTransit = globalThis as unknown as {
  transitState: TransitState | undefined;
};

export const transitState = globalForTransit.transitState ?? new TransitState();

if (env.NODE_ENV !== "production") {
  globalForTransit.transitState = transitState;
}
