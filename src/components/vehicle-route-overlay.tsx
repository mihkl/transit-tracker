"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { Polyline, CircleMarker, Popup } from "react-leaflet";
import type { VehicleDto, PatternStop, VehicleStopEta } from "@/lib/types";
import { TYPE_COLORS } from "@/lib/constants";
import { interpolatePosition } from "@/lib/geo-utils";

interface VehicleRouteOverlayProps {
  vehicle: VehicleDto;
  shapes: Record<string, number[][]>;
  disabled?: boolean;
}

export function VehicleRouteOverlay({
  vehicle,
  shapes,
  disabled,
}: VehicleRouteOverlayProps) {
  const [stops, setStops] = useState<PatternStop[]>([]);
  const [siriEtas, setSiriEtas] = useState<VehicleStopEta[]>([]);
  const stopsCache = useRef<Record<string, PatternStop[]>>({});

  const routeKey = vehicle.routeKey;
  const shape = routeKey ? shapes[routeKey] : null;
  const color = TYPE_COLORS[vehicle.transportType] || TYPE_COLORS.unknown;

  // Fetch stops for this route
  useEffect(() => {
    if (!routeKey) {
      setStops([]);
      return;
    }

    if (stopsCache.current[routeKey]) {
      setStops(stopsCache.current[routeKey]);
      return;
    }

    fetch(`/api/stops?routeKey=${encodeURIComponent(routeKey)}`)
      .then((r) => r.json())
      .then((data: PatternStop[]) => {
        stopsCache.current[routeKey] = data;
        setStops(data);
      })
      .catch((err) => console.error("Failed to fetch stops:", err));
  }, [routeKey]);

  // Fetch SIRI ETAs for this vehicle
  useEffect(() => {
    if (!vehicle.id) {
      setSiriEtas([]);
      return;
    }

    fetch(`/api/vehicle-stops?vehicleId=${vehicle.id}`)
      .then((r) => r.json())
      .then((data: VehicleStopEta[]) => {
        setSiriEtas(data);
      })
      .catch((err) => console.error("Failed to fetch vehicle ETAs:", err));

    // Refresh every 30 seconds
    const interval = setInterval(() => {
      fetch(`/api/vehicle-stops?vehicleId=${vehicle.id}`)
        .then((r) => r.json())
        .then((data: VehicleStopEta[]) => setSiriEtas(data))
        .catch(() => {});
    }, 30_000);

    return () => clearInterval(interval);
  }, [vehicle.id]);

  // Split shape into completed and upcoming portions
  const { completedPath, upcomingPath } = useMemo(() => {
    if (!shape || shape.length < 2) {
      return { completedPath: [] as number[][], upcomingPath: [] as number[][] };
    }

    const dist = vehicle.distanceAlongRoute;
    const splitPoint = interpolatePosition(shape, dist);

    const completed: number[][] = [];
    const upcoming: number[][] = [];

    for (const pt of shape) {
      if (pt[2] <= dist) {
        completed.push([pt[0], pt[1]]);
      } else {
        if (upcoming.length === 0 && splitPoint) {
          // Add the interpolated split point to both paths
          completed.push(splitPoint);
          upcoming.push(splitPoint);
        }
        upcoming.push([pt[0], pt[1]]);
      }
    }

    // Edge case: if dist is before first point
    if (upcoming.length === 0 && completed.length > 0 && splitPoint) {
      upcoming.push(splitPoint);
    }
    if (completed.length === 0 && splitPoint) {
      completed.push(splitPoint);
    }

    return { completedPath: completed, upcomingPath: upcoming };
  }, [shape, vehicle.distanceAlongRoute]);

  if (!routeKey || !shape || disabled) return null;

  const vehicleDist = vehicle.distanceAlongRoute;
  const vehicleSpeed = vehicle.speedMs > 0 ? vehicle.speedMs : 20 / 3.6; // fallback 20 km/h

  // Build a map from stopId to SIRI ETA for quick lookup
  const siriMap = new Map<string, VehicleStopEta>();
  for (const eta of siriEtas) {
    siriMap.set(eta.stopId, eta);
  }

  return (
    <>
      {/* Completed portion: gray dashed */}
      {completedPath.length >= 2 && (
        <Polyline
          positions={completedPath as [number, number][]}
          pathOptions={{
            color: "#666",
            weight: 4,
            opacity: 0.4,
            dashArray: "8 6",
          }}
        />
      )}

      {/* Upcoming portion: colored solid */}
      {upcomingPath.length >= 2 && (
        <Polyline
          positions={upcomingPath as [number, number][]}
          pathOptions={{
            color,
            weight: 4,
            opacity: 0.85,
          }}
        />
      )}

      {/* Stop markers */}
      {stops.map((stop) => {
        const isPassed = stop.distAlongRoute <= vehicleDist;
        const siriEta = siriMap.get(stop.stopId);

        // Use SIRI data if available, otherwise fall back to distance-based estimate
        let etaSeconds: number;
        let delaySeconds: number | null = null;
        if (siriEta && siriEta.expectedArrivalSeconds != null) {
          etaSeconds = siriEta.expectedArrivalSeconds;
          delaySeconds = siriEta.delaySeconds;
        } else {
          const remainingDist = stop.distAlongRoute - vehicleDist;
          etaSeconds = remainingDist > 0 ? remainingDist / vehicleSpeed : 0;
        }
        const etaMinutes = Math.round(etaSeconds / 60);

        // Delay color indicator
        let delayColor: string | undefined;
        if (delaySeconds != null && !isPassed) {
          const absDelay = Math.abs(delaySeconds);
          if (absDelay < 60) delayColor = "#4CAF50"; // green: on time
          else if (absDelay <= 180) delayColor = "#FF9800"; // yellow: 1-3min
          else delayColor = "#F44336"; // red: >3min
        }

        return (
          <CircleMarker
            key={stop.stopId}
            center={[stop.latitude, stop.longitude]}
            radius={5}
            pathOptions={{
              fillColor: isPassed ? "#888" : delayColor || "#fff",
              color: isPassed ? "#666" : color,
              weight: isPassed ? 1 : 2,
              fillOpacity: isPassed ? 0.4 : 0.95,
              opacity: isPassed ? 0.5 : 1,
            }}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-medium">{stop.stopName}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {isPassed ? (
                    <span className="text-gray-500">Passed</span>
                  ) : (
                    <span>
                      ETA ~{etaMinutes <= 0 ? "<1" : etaMinutes}m
                      {delaySeconds != null && Math.abs(delaySeconds) >= 60 && (
                        <span
                          className="ml-1"
                          style={{ color: delayColor }}
                        >
                          ({delaySeconds > 0 ? "+" : ""}
                          {Math.round(delaySeconds / 60)}m)
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}
