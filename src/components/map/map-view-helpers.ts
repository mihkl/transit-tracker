"use client";

import type {
  ExpressionSpecification,
  LngLatBoundsLike,
  Map as MaplibreMap,
} from "maplibre-gl";
import type {
  RoutePlanResponse,
  StopDto,
  VehicleDto,
} from "@/lib/types";
import { LEG_COLORS, TYPE_COLORS } from "@/lib/constants";

export const ROUTE_LEG_COLOR_EXPRESSION: ExpressionSpecification = [
  "match",
  ["get", "mode"],
  "WALK",
  LEG_COLORS.WALK,
  "walk",
  LEG_COLORS.WALK,
  "BUS",
  LEG_COLORS.BUS,
  "bus",
  LEG_COLORS.BUS,
  "TRAM",
  LEG_COLORS.TRAM,
  "tram",
  LEG_COLORS.TRAM,
  "LIGHT_RAIL",
  LEG_COLORS.TRAM,
  "TROLLEYBUS",
  LEG_COLORS.TROLLEYBUS,
  "trolleybus",
  LEG_COLORS.TROLLEYBUS,
  "TRAIN",
  LEG_COLORS.TRAIN,
  "train",
  LEG_COLORS.TRAIN,
  "RAIL",
  LEG_COLORS.TRAIN,
  "HEAVY_RAIL",
  LEG_COLORS.TRAIN,
  "COMMUTER_TRAIN",
  LEG_COLORS.TRAIN,
  "INTERCITY_TRAIN",
  LEG_COLORS.TRAIN,
  "HIGH_SPEED_TRAIN",
  LEG_COLORS.TRAIN,
  "LONG_DISTANCE_TRAIN",
  LEG_COLORS.TRAIN,
  "METRO_RAIL",
  LEG_COLORS.TRAIN,
  "SUBWAY",
  LEG_COLORS.TRAIN,
  "MONORAIL",
  LEG_COLORS.TRAIN,
  "#007bff",
];

export function fitMapToPoints(
  map: {
    fitBounds: (bounds: LngLatBoundsLike, options: { padding: { top: number; left: number; right: number; bottom: number }; duration: number }) => void;
  },
  points: number[][],
  options?: { isDesktop?: boolean; reserveBottomSpace?: boolean },
) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const [lat, lng] of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }

  if (minLat === Infinity) return;

  const isDesktop = options?.isDesktop ?? true;
  const reserveBottomSpace = options?.reserveBottomSpace ?? false;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 720;
  const cssSheetHeight =
    typeof window !== "undefined"
      ? Number.parseFloat(
          getComputedStyle(document.documentElement)
            .getPropertyValue("--mobile-route-sheet-height")
            .trim(),
        )
      : Number.NaN;

  const dynamicSheetPadding =
    Number.isFinite(cssSheetHeight) && cssSheetHeight > 0
      ? Math.round(cssSheetHeight + 24)
      : Math.max(240, Math.round(viewportHeight * 0.48));

  const mobileBottomPadding = reserveBottomSpace
    ? Math.min(dynamicSheetPadding, Math.round(viewportHeight * 0.82))
    : 88;

  map.fitBounds(
    [
      [minLng, minLat],
      [maxLng, maxLat],
    ] as LngLatBoundsLike,
    {
      padding: isDesktop
        ? { top: 70, left: 70, right: 70, bottom: 70 }
        : { top: 48, left: 36, right: 36, bottom: mobileBottomPadding },
      duration: 550,
    },
  );
}

export function addVehicleArrowImage(map: MaplibreMap) {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const scale = size / 24;
  ctx.beginPath();
  ctx.moveTo(12 * scale, 3 * scale);
  ctx.lineTo(20 * scale, 21 * scale);
  ctx.lineTo(12 * scale, 16 * scale);
  ctx.lineTo(4 * scale, 21 * scale);
  ctx.closePath();
  ctx.lineJoin = "round";
  ctx.fillStyle = "#fff";
  ctx.fill();

  const imageData = ctx.getImageData(0, 0, size, size);
  if (map.hasImage("vehicle-arrow")) map.removeImage("vehicle-arrow");
  map.addImage("vehicle-arrow", imageData, { sdf: true });
}

export function buildRouteLegFeatures(
  routePlan: RoutePlanResponse | null,
  selectedRouteIndex: number,
) {
  if (!routePlan || !routePlan.routes[selectedRouteIndex]) return null;
  const route = routePlan.routes[selectedRouteIndex];
  return route.legs.map((leg) => ({
    type: "Feature" as const,
    properties: {
      mode: leg.mode,
      lineNumber: leg.lineNumber,
    },
    geometry: {
      type: "LineString" as const,
      coordinates: leg.polyline.map((p) => [p[1], p[0]]),
    },
  }));
}

export function buildVehicleRouteFeature(
  focusedVehicle: VehicleDto | null,
  shapes: Record<string, number[][]> | null,
) {
  if (!focusedVehicle || !shapes || !focusedVehicle.routeKey || !shapes[focusedVehicle.routeKey]) {
    return null;
  }
  const shape = shapes[focusedVehicle.routeKey];
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates: shape.map((p) => [p[1], p[0]]),
    },
  };
}

export function buildVehiclesFeatureCollection(
  vehicles: VehicleDto[],
  focusedVehicleId: number | null,
) {
  return {
    type: "FeatureCollection" as const,
    features: vehicles.map((vehicle) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [vehicle.longitude, vehicle.latitude],
      },
      properties: {
        id: vehicle.id,
        bearing: vehicle.bearing ?? vehicle.heading,
        color: TYPE_COLORS[vehicle.transportType] || TYPE_COLORS.unknown,
        focused: focusedVehicleId === vehicle.id ? 1 : 0,
      },
    })),
  };
}

export function buildStopsFeatureCollection(stops: StopDto[]) {
  return {
    type: "FeatureCollection" as const,
    features: stops.map((stop) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [stop.longitude, stop.latitude],
      },
      properties: {
        stopId: stop.stopId,
        name: stop.stopName,
      },
    })),
  };
}

export function buildBoardingStops(
  routePlan: RoutePlanResponse | null,
  selectedRouteIndex: number,
) {
  if (!routePlan || !routePlan.routes[selectedRouteIndex]) return [];

  const route = routePlan.routes[selectedRouteIndex];
  const stops: {
    lat: number;
    lng: number;
    name: string;
    lineNumber?: string;
    transportType?: string;
  }[] = [];

  for (const leg of route.legs) {
    if (leg.mode !== "WALK" && leg.departureStopLat && leg.departureStopLng) {
      stops.push({
        lat: leg.departureStopLat,
        lng: leg.departureStopLng,
        name: leg.departureStop || "Boarding stop",
        lineNumber: leg.lineNumber,
        transportType: leg.mode.toLowerCase(),
      });
    }
  }
  return stops;
}
