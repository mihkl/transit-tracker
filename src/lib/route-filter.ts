import type { PlannedRoute, RoutePlanResponse } from "@/lib/types";
import { parseDurationSeconds } from "@/lib/route-time";

export type RoutingMode = "fastest" | "less-walking" | "fewer-transfers";

export interface RouteCache {
  fastest: RoutePlanResponse | null;
  lessWalking: RoutePlanResponse | null;
  fewerTransfers: RoutePlanResponse | null;
}

export const ROUTING_MODES: {
  value: RoutingMode;
  label: string;
  iconName: "zap" | "footprints" | "arrow-right-left";
}[] = [
  { value: "fastest", label: "Fastest", iconName: "zap" },
  { value: "less-walking", label: "Less walking", iconName: "footprints" },
  { value: "fewer-transfers", label: "Fewer transfers", iconName: "arrow-right-left" },
];

function routeFingerprint(route: PlannedRoute) {
  return route.legs
    .filter((l) => l.mode !== "WALK")
    .map((l) => `${l.lineNumber ?? l.mode}:${l.departureStop ?? ""}→${l.arrivalStop ?? ""}`)
    .join("|");
}

export function mergeAndDedupeRoutes(
  a: RoutePlanResponse | null,
  b: RoutePlanResponse | null,
) {
  const all = [...(a?.routes ?? []), ...(b?.routes ?? [])];
  const seen = new Set<string>();
  const unique: PlannedRoute[] = [];
  for (const route of all) {
    const fp = routeFingerprint(route);
    if (!seen.has(fp)) {
      seen.add(fp);
      unique.push(route);
    }
  }
  return unique;
}

export function fastestRoutes(routes: PlannedRoute[], limit = 5) {
  return [...routes]
    .sort((a, b) => parseDurationSeconds(a.duration) - parseDurationSeconds(b.duration))
    .slice(0, limit);
}

function totalWalkMeters(route: PlannedRoute) {
  return route.legs
    .filter((l) => l.mode === "WALK")
    .reduce((sum, l) => sum + Number(l.distanceMeters), 0);
}

export function lessWalkingRoutes(routes: PlannedRoute[], limit = 5) {
  return [...routes].sort((a, b) => totalWalkMeters(a) - totalWalkMeters(b)).slice(0, limit);
}

function transitLegCount(route: PlannedRoute) {
  return route.legs.filter((l) => l.mode !== "WALK").length;
}

export function fewerTransfersRoutes(routes: PlannedRoute[], limit = 5) {
  return [...routes].sort((a, b) => transitLegCount(a) - transitLegCount(b)).slice(0, limit);
}

export function resolveRoutePlan(cache: RouteCache, mode: RoutingMode) {
  return mode === "fastest"
    ? cache.fastest
    : mode === "less-walking"
      ? cache.lessWalking
      : cache.fewerTransfers;
}
