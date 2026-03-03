import type { GpsReading, VehicleState, GtfsData } from "@/lib/types";
import { MAX_HISTORY_SIZE } from "@/lib/types";
import { findPositionOnRoute, segmentBearing, angleDiff } from "./geo-utils";

const STALE_VEHICLE_MS = 2 * 60 * 1000;
const ROUTE_MATCH_MAX_DISTANCE_M = 500;

export class VehicleTracker {
  private vehicles = new Map<string, VehicleState>();
  private gtfs: GtfsData;

  constructor(gtfs: GtfsData) {
    this.gtfs = gtfs;
  }

  getVehicles() {
    return this.vehicles;
  }

  processReadings(readings: GpsReading[]) {
    const updated: VehicleState[] = [];

    for (const reading of readings) {
      const state = this.getOrCreateState(reading);

      state.latitude = reading.latitude;
      state.longitude = reading.longitude;
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
        distanceAlongRoute: state.distanceAlongRoute,
        stopIndex: state.lastStopIndex,
        timestamp: state.lastUpdateTime,
      });

      if (state.positionHistory.length > MAX_HISTORY_SIZE) {
        state.positionHistory.shift();
      }

      updated.push(state);
    }

    // Safe: JS spec guarantees Map deletion during iteration works correctly
    const cutoff = new Date(Date.now() - STALE_VEHICLE_MS);
    for (const [key, v] of this.vehicles) {
      if (v.lastUpdateTime < cutoff) {
        this.vehicles.delete(key);
      }
    }

    return updated;
  }

  private getOrCreateState(reading: GpsReading) {
    let state = this.vehicles.get(reading.id);

    if (!state) {
      state = {
        id: reading.id,
        transportType: reading.transportType,
        lineNumber: reading.lineNumber,
        latitude: reading.latitude,
        longitude: reading.longitude,
        heading: reading.heading,
        destination: reading.destination,
        matchedRouteId: null,
        matchedDirectionId: null,
        lastStopIndex: -1,
        distanceAlongRoute: 0,
        routeOffsetMeters: null,
        lastUpdateTime: reading.timestamp,
        positionHistory: [],
      };
      this.vehicles.set(reading.id, state);
    }

    if (state.lineNumber !== reading.lineNumber || state.transportType !== reading.transportType) {
      state.matchedRouteId = null;
      this.clearRouteProgress(state);
      state.positionHistory = [];
    }

    return state;
  }

  private matchRoute(state: VehicleState, reading: GpsReading) {
    if (state.matchedRouteId !== null) return true;

    const key = `${reading.transportType}_${reading.lineNumber}`;
    const routeId = this.gtfs.gpsToRouteMap.get(key);
    if (routeId) {
      state.matchedRouteId = routeId;
      return true;
    }

    return false;
  }

  private matchDirectionAndProgress(state: VehicleState) {
    if (state.matchedRouteId === null) {
      this.clearRouteProgress(state);
      return;
    }

    // Project onto direction 0's shape to get position along route
    const key0 = `${state.matchedRouteId}_0`;
    const pattern0 = this.gtfs.patterns.get(key0);
    if (!pattern0 || pattern0.shapePoints.length < 2) {
      this.clearRouteProgress(state);
      return;
    }

    const result0 = findPositionOnRoute(
      state.latitude,
      state.longitude,
      pattern0.shapePoints,
    );

    if (result0.perpDist > ROUTE_MATCH_MAX_DISTANCE_M) {
      this.clearRouteProgress(state);
      return;
    }

    // Use vehicle heading to determine direction
    const seg = pattern0.shapePoints;
    const routeBearing = segmentBearing(
      seg[result0.segmentIndex].latitude, seg[result0.segmentIndex].longitude,
      seg[result0.segmentIndex + 1].latitude, seg[result0.segmentIndex + 1].longitude,
    );

    // If heading aligns with direction 0's bearing, direction is 0; otherwise 1
    const direction = angleDiff(state.heading, routeBearing) < 90 ? 0 : 1;

    if (direction === 0) {
      state.matchedDirectionId = 0;
      state.distanceAlongRoute = result0.distAlong;
      state.lastStopIndex = this.findLastStopIndex(pattern0.orderedStops, result0.distAlong);
      state.routeOffsetMeters = result0.perpDist;
    } else {
      // For direction 1, project onto its own shape for accurate distAlong
      const key1 = `${state.matchedRouteId}_1`;
      const pattern1 = this.gtfs.patterns.get(key1);
      if (!pattern1 || pattern1.shapePoints.length < 2) {
        this.clearRouteProgress(state);
        return;
      }

      const result = findPositionOnRoute(state.latitude, state.longitude, pattern1.shapePoints);
      if (result.perpDist > ROUTE_MATCH_MAX_DISTANCE_M) {
        this.clearRouteProgress(state);
        return;
      }

      state.matchedDirectionId = 1;
      state.distanceAlongRoute = result.distAlong;
      state.lastStopIndex = this.findLastStopIndex(pattern1.orderedStops, result.distAlong);
      state.routeOffsetMeters = result.perpDist;
    }
  }

  private clearRouteProgress(state: VehicleState) {
    state.matchedDirectionId = null;
    state.lastStopIndex = -1;
    state.distanceAlongRoute = 0;
    state.routeOffsetMeters = null;
  }

  private findLastStopIndex(stops: { distAlongRoute: number }[], distAlong: number) {
    for (let i = stops.length - 1; i >= 0; i--) {
      if (stops[i].distAlongRoute <= distAlong) {
        return i;
      }
    }
    return -1;
  }
}
