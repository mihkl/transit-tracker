import * as path from "path";
import type {
  GpsReading,
  VehicleDto,
  LineDto,
  GtfsData,
  PatternStop,
  VehicleState,
  ScheduleEntry,
} from "@/lib/types";
import { loadGtfs } from "./gtfs-loader";
import { VehicleTracker } from "./vehicle-tracker";
import { GpsPollerService } from "./gps-poller";
import { haversineDistance } from "./geo-utils";

class TransitState {
  private gtfs: GtfsData | null = null;
  private tracker: VehicleTracker | null = null;
  private poller: GpsPollerService | null = null;
  private shapesCache: Record<string, number[][]> | null = null;
  private lastUpdate = new Date(0);
  private initialized = false;
  private initializing = false;
  private updateCallbacks: Set<() => void> = new Set();

  onUpdate(callback: () => void): () => void {
    this.updateCallbacks.add(callback);
    return () => this.updateCallbacks.delete(callback);
  }

  private notifyUpdate(): void {
    for (const cb of this.updateCallbacks) {
      try {
        cb();
      } catch (err) {
        console.error("Update callback error:", err);
      }
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized || this.initializing) return;
    this.initializing = true;

    try {
      const gtfsDir = process.env.GTFS_DATA_DIR || path.join(process.cwd(), "data", "tallinn");
      console.log(`Loading GTFS from ${path.resolve(gtfsDir)}...`);

      this.gtfs = await loadGtfs(gtfsDir);
      this.tracker = new VehicleTracker(this.gtfs);

      this.poller = new GpsPollerService((readings) => {
        this.processReadings(readings);
      }, 10_000);
      this.poller.start();

      this.initialized = true;
      console.log("GTFS loaded, GPS poller started.");
    } catch (err) {
      this.initializing = false;
      console.error("Failed to initialize TransitState:", err);
      throw err;
    }
  }

  isReady(): boolean {
    return this.initialized;
  }

  private processReadings(readings: GpsReading[]): void {
    if (!this.tracker) return;
    this.tracker.processReadings(readings);
    this.lastUpdate = new Date();
    this.notifyUpdate();
  }

  getVehicles(lineFilter?: string, typeFilter?: string): VehicleDto[] {
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

  getVehicleById(id: number): VehicleState | null {
    if (!this.tracker) return null;
    return this.tracker.getVehicles().get(id) ?? null;
  }

  getStopIdByCoords(lat: number, lng: number): string | null {
    if (!this.gtfs) return null;
    let bestId: string | null = null;
    let bestDist = Infinity;
    for (const stop of this.gtfs.stops.values()) {
      const dist = haversineDistance(lat, lng, stop.latitude, stop.longitude);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = stop.stopId;
      }
    }
    return bestDist < 200 ? bestId : null;
  }

  getGtfs(): GtfsData | null {
    return this.gtfs;
  }

  getLines(): LineDto[] {
    if (!this.gtfs) return [];

    return Array.from(this.gtfs.routes.values())
      .map((r) => ({
        lineNumber: r.shortName,
        type: getTypeName(r.routeId),
        routeId: r.routeId,
      }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        const an = parseInt(a.lineNumber, 10) || 0;
        const bn = parseInt(b.lineNumber, 10) || 0;
        if (an !== bn) return an - bn;
        return a.lineNumber.localeCompare(b.lineNumber);
      });
  }

  getShapes(): Record<string, number[][]> | null {
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

  getPatternStops(routeKey: string): PatternStop[] | null {
    if (!routeKey || !this.gtfs) return null;

    const pattern = this.gtfs.patterns.get(routeKey);
    return pattern?.orderedStops ?? null;
  }

  getScheduleForStop(routeId: string, stopId: string): ScheduleEntry[] | null {
    if (!this.gtfs) return null;
    const key = `${routeId}_${stopId}`;
    return this.gtfs.scheduleByRouteStop.get(key) ?? null;
  }

  getRouteIdForLine(lineNumber: string, typeFilter?: string): string | null {
    if (!this.gtfs) return null;
    const typeNums =
      typeFilter === "tram"
        ? [3]
        : typeFilter === "trolleybus"
          ? [1]
          : typeFilter === "bus"
            ? [2, 7]
            : typeFilter === "train"
              ? [10]
              : [1, 2, 3, 7, 10];
    for (const t of typeNums) {
      const routeId = this.gtfs.gpsToRouteMap.get(`${t}_${lineNumber}`);
      if (routeId) return routeId;
    }
    return null;
  }

  private toDto(v: VehicleState): VehicleDto {
    const dto: VehicleDto = {
      id: v.id,
      lineNumber: v.lineNumber,
      transportType: getTypeNameFromGps(v.transportType),
      latitude: v.latitude,
      longitude: v.longitude,
      speed: v.speed,
      heading: v.heading,
      bearing: v.heading,
      destination: v.destination,
      directionId: v.matchedDirectionId ?? 0,
      stopIndex: v.lastStopIndex,
      totalStops: 0,
      nextStop: null,
      distanceAlongRoute: Math.round(v.distanceAlongRoute * 10) / 10,
      speedMs: Math.round(computeSpeedMs(v) * 100) / 100,
      routeKey:
        v.matchedRouteId !== null && v.matchedDirectionId !== null
          ? `${v.matchedRouteId}_${v.matchedDirectionId}`
          : null,
    };

    if (v.matchedRouteId !== null && v.matchedDirectionId !== null && this.gtfs) {
      const key = `${v.matchedRouteId}_${v.matchedDirectionId}`;
      const pattern = this.gtfs.patterns.get(key);
      if (pattern) {
        dto.totalStops = pattern.orderedStops.length;

        const nextIdx = v.lastStopIndex + 1;
        if (nextIdx < pattern.orderedStops.length) {
          const nextStop = pattern.orderedStops[nextIdx];
          let dist = nextStop.distAlongRoute - v.distanceAlongRoute;
          if (dist < 0) dist = 0;

          const speedMs = computeSpeedMs(v);
          const speed = speedMs > 0.5 ? speedMs : 20.0 / 3.6;
          const etaSeconds = dist / speed;

          dto.nextStop = {
            name: nextStop.stopName,
            latitude: nextStop.latitude,
            longitude: nextStop.longitude,
            distanceMeters: Math.round(dist),
            etaSeconds: Math.round(etaSeconds),
          };
        }
      }
    }

    return dto;
  }
}

function computeSpeedMs(v: VehicleState): number {
  if (v.positionHistory.length >= 2) {
    const prev = v.positionHistory[v.positionHistory.length - 2];
    const curr = v.positionHistory[v.positionHistory.length - 1];
    const dt = (curr.timestamp.getTime() - prev.timestamp.getTime()) / 1000;
    if (dt > 0.5) {
      const dd = curr.distanceAlongRoute - prev.distanceAlongRoute;
      if (dd > 0) return Math.min(dd / dt, 25);
    }
  }

  return 0;
}

function getTransportTypes(typeFilter: string): Set<number> {
  switch (typeFilter) {
    case "bus":
      return new Set([2, 7]);
    case "tram":
      return new Set([3]);
    case "trolleybus":
      return new Set([1]);
    case "train":
      return new Set([10]);
    default:
      return new Set([1, 2, 3, 7, 10]);
  }
}

function getTypeNameFromGps(transportType: number): string {
  switch (transportType) {
    case 1:
      return "trolleybus";
    case 2:
      return "bus";
    case 3:
      return "tram";
    case 7:
      return "bus";
    case 10:
      return "train";
    default:
      return "unknown";
  }
}

function getTypeName(routeId: string): string {
  if (routeId.includes("_tram_")) return "tram";
  if (routeId.includes("_train_") || routeId.includes("_rail_")) return "train";
  if (routeId.includes("_bus_")) return "bus";
  return "bus";
}

const globalForTransit = globalThis as unknown as {
  transitState: TransitState | undefined;
};

export const transitState = globalForTransit.transitState ?? new TransitState();

if (process.env.NODE_ENV !== "production") {
  globalForTransit.transitState = transitState;
}
