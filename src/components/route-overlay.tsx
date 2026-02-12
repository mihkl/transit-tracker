"use client";

import { useMemo } from "react";
import { Polyline, CircleMarker, Tooltip } from "react-leaflet";
import type { RoutePlanResponse } from "@/lib/types";
import { LEG_COLORS } from "@/lib/constants";

interface RouteOverlayProps {
  routePlan: RoutePlanResponse | null;
  selectedRouteIndex: number;
  origin: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number } | null;
}

interface TransferPoint {
  lat: number;
  lng: number;
  fromLine: string;
  toLine: string;
}

export function RouteOverlay({
  routePlan,
  selectedRouteIndex,
  origin,
  destination,
}: RouteOverlayProps) {
  const hasRoutes =
    routePlan && routePlan.routes && routePlan.routes.length > 0;
  const route = hasRoutes
    ? routePlan.routes[selectedRouteIndex] || routePlan.routes[0]
    : null;

  // Find transfer points between consecutive transit legs
  const transfers = useMemo<TransferPoint[]>(() => {
    if (!route) return [];
    const points: TransferPoint[] = [];
    const legs = route.legs;

    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      if (leg.mode === "WALK" || !leg.lineNumber) continue;

      // Look ahead for the next transit leg
      for (let j = i + 1; j < legs.length; j++) {
        const next = legs[j];
        if (next.mode === "WALK") continue;
        if (!next.lineNumber) break;

        // Found two consecutive transit legs — the transfer is at
        // the arrival of the current leg / departure of the next
        const lat = leg.arrivalStopLat ?? next.departureStopLat;
        const lng = leg.arrivalStopLng ?? next.departureStopLng;

        if (lat != null && lng != null) {
          points.push({
            lat,
            lng,
            fromLine: `${leg.lineNumber}`,
            toLine: `${next.lineNumber}`,
          });
        }
        break;
      }
    }

    return points;
  }, [route]);

  return (
    <>
      {route &&
        route.legs.map((leg, i) => {
          if (!leg.polyline || leg.polyline.length < 2) return null;
          const positions = leg.polyline.map(
            (p) => [p[0], p[1]] as [number, number]
          );
          const color = LEG_COLORS[leg.mode] || LEG_COLORS.WALK;
          const isWalk = leg.mode === "WALK";

          return (
            <Polyline
              key={i}
              positions={positions}
              pathOptions={{
                color,
                weight: isWalk ? 3 : 5,
                opacity: 0.8,
                dashArray: isWalk ? "8, 12" : undefined,
              }}
            />
          );
        })}

      {/* Transfer markers */}
      {transfers.map((t, i) => (
        <CircleMarker
          key={`transfer-${i}`}
          center={[t.lat, t.lng]}
          radius={7}
          pathOptions={{
            fillColor: "#FF9800",
            color: "#fff",
            weight: 2,
            fillOpacity: 1,
          }}
        >
          <Tooltip direction="top" offset={[0, -8]} permanent={false}>
            <span className="text-xs font-medium">
              {t.fromLine} → {t.toLine}
            </span>
          </Tooltip>
        </CircleMarker>
      ))}

      {origin && (
        <CircleMarker
          center={[origin.lat, origin.lng]}
          radius={8}
          pathOptions={{
            fillColor: "#4CAF50",
            color: "#fff",
            weight: 2,
            fillOpacity: 1,
          }}
        />
      )}

      {destination && (
        <CircleMarker
          center={[destination.lat, destination.lng]}
          radius={8}
          pathOptions={{
            fillColor: "#F44336",
            color: "#fff",
            weight: 2,
            fillOpacity: 1,
          }}
        />
      )}
    </>
  );
}
