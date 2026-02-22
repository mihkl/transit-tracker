import type { GpsReading, VehicleState, GtfsData } from "@/lib/types";
import { MAX_HISTORY_SIZE } from "@/lib/types";
import { findPositionOnRoute } from "./geo-utils";

export class VehicleTracker {
  private vehicles = new Map<number, VehicleState>();
  private gtfs: GtfsData;

  constructor(gtfs: GtfsData) {
    this.gtfs = gtfs;
  }

  getVehicles(): Map<number, VehicleState> {
    return this.vehicles;
  }

  processReadings(readings: GpsReading[]): VehicleState[] {
    const updated: VehicleState[] = [];

    for (const reading of readings) {
      const state = this.getOrCreateState(reading);

      state.latitude = reading.latitude;
      state.longitude = reading.longitude;
      state.speed = reading.speed;
      state.heading = reading.heading;
      state.transportType = reading.transportType;
      state.lineNumber = reading.lineNumber;
      state.destination = reading.destination;
      state.lastUpdateTime = reading.timestamp;

      if (!this.matchRoute(state, reading)) continue;

      this.matchDirectionAndProgress(state);

      state.positionHistory.push({
        latitude: state.latitude,
        longitude: state.longitude,
        speed: state.speed,
        distanceAlongRoute: state.distanceAlongRoute,
        stopIndex: state.lastStopIndex,
        timestamp: state.lastUpdateTime,
      });

      if (state.positionHistory.length > MAX_HISTORY_SIZE) {
        state.positionHistory.shift();
      }

      updated.push(state);
    }

    const cutoff = new Date(Date.now() - 2 * 60 * 1000);
    for (const [key, v] of this.vehicles) {
      if (v.lastUpdateTime < cutoff) {
        this.vehicles.delete(key);
      }
    }

    return updated;
  }

  private getOrCreateState(reading: GpsReading): VehicleState {
    let state = this.vehicles.get(reading.id);

    if (!state) {
      state = {
        id: reading.id,
        transportType: 0,
        lineNumber: "",
        latitude: 0,
        longitude: 0,
        speed: null,
        heading: 0,
        destination: "",
        matchedRouteId: null,
        matchedDirectionId: null,
        lastStopIndex: -1,
        distanceAlongRoute: 0,
        lastUpdateTime: new Date(),
        positionHistory: [],
      };
      this.vehicles.set(reading.id, state);
    }

    if (state.lineNumber !== reading.lineNumber || state.transportType !== reading.transportType) {
      state.matchedRouteId = null;
      state.matchedDirectionId = null;
      state.lastStopIndex = -1;
      state.distanceAlongRoute = 0;
      state.positionHistory = [];
    }

    return state;
  }

  private matchRoute(state: VehicleState, reading: GpsReading): boolean {
    if (state.matchedRouteId !== null) return true;

    const key = `${reading.transportType}_${reading.lineNumber}`;
    const routeId = this.gtfs.gpsToRouteMap.get(key);
    if (routeId) {
      state.matchedRouteId = routeId;
      return true;
    }

    return false;
  }

  private matchDirectionAndProgress(state: VehicleState): void {
    if (state.matchedRouteId === null) return;

    let bestPerpDist = Infinity;
    let bestDirection = -1;
    let bestDistAlong = 0;

    for (let dir = 0; dir <= 1; dir++) {
      const key = `${state.matchedRouteId}_${dir}`;
      const pattern = this.gtfs.patterns.get(key);
      if (!pattern || pattern.shapePoints.length === 0) continue;

      const { distAlong, perpDist } = findPositionOnRoute(
        state.latitude,
        state.longitude,
        pattern.shapePoints,
      );

      if (perpDist < bestPerpDist) {
        bestPerpDist = perpDist;
        bestDirection = dir;
        bestDistAlong = distAlong;
      }
    }

    if (bestDirection < 0) return;

    if (state.matchedDirectionId !== null && state.matchedDirectionId !== bestDirection) {
      if (bestPerpDist > 200) return;

      const currentKey = `${state.matchedRouteId}_${state.matchedDirectionId}`;
      const currentPattern = this.gtfs.patterns.get(currentKey);
      if (currentPattern && currentPattern.shapePoints.length > 0) {
        const { perpDist: currentPerpDist } = findPositionOnRoute(
          state.latitude,
          state.longitude,
          currentPattern.shapePoints,
        );
        if (currentPerpDist - bestPerpDist < 100) {
          const { distAlong } = findPositionOnRoute(
            state.latitude,
            state.longitude,
            currentPattern.shapePoints,
          );
          state.distanceAlongRoute = distAlong;
          return;
        }
      }
    }

    state.matchedDirectionId = bestDirection;
    state.distanceAlongRoute = bestDistAlong;

    const pattern = this.gtfs.patterns.get(`${state.matchedRouteId}_${bestDirection}`);
    if (pattern) {
      state.lastStopIndex = this.findLastStopIndex(pattern.orderedStops, bestDistAlong);
    }
  }

  private findLastStopIndex(stops: { distAlongRoute: number }[], distAlong: number): number {
    for (let i = stops.length - 1; i >= 0; i--) {
      if (stops[i].distAlongRoute <= distAlong) {
        return i;
      }
    }
    return -1;
  }
}
