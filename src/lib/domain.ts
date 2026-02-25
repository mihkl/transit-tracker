export const TRANSPORT_TYPES = ["bus", "tram", "trolleybus", "train", "unknown"] as const;
export type TransportType = (typeof TRANSPORT_TYPES)[number];

export const LINE_TYPES = ["bus", "tram", "trolleybus", "train"] as const;
export type LineType = (typeof LINE_TYPES)[number];

export const TYPE_FILTERS = ["all", ...LINE_TYPES] as const;
export type TypeFilter = (typeof TYPE_FILTERS)[number];

export const TRANSIT_MODES = ["WALK", "BUS", "TRAM", "TROLLEYBUS", "TRAIN"] as const;
export type TransitMode = (typeof TRANSIT_MODES)[number];

export const DELAY_STATUSES = ["on_time", "delayed", "early", "unknown"] as const;
export type DelayStatus = (typeof DELAY_STATUSES)[number];

export const MAP_LAYER_IDS = {
  VEHICLES: "vehicles",
  ALL_STOPS: "all-stops",
  ALL_STOPS_HIT: "all-stops-hit",
  VEHICLE_ROUTE: "vehicle-route",
  ROUTE_LEGS: "route-legs",
  TRAFFIC_FLOW: "traffic-flow",
} as const;
export type MapLayerId = (typeof MAP_LAYER_IDS)[keyof typeof MAP_LAYER_IDS];

export function isTransportType(value: string): value is TransportType {
  return (TRANSPORT_TYPES as readonly string[]).includes(value);
}

export function isLineType(value: string): value is LineType {
  return (LINE_TYPES as readonly string[]).includes(value);
}

export function normalizeTransportType(value: string | null | undefined): TransportType {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "tram") return "tram";
  if (v === "trolleybus") return "trolleybus";
  if (v === "train" || v === "rail") return "train";
  if (v === "bus") return "bus";
  return "unknown";
}

export function normalizeLineType(value: string | null | undefined): LineType {
  const normalized = normalizeTransportType(value);
  return normalized === "unknown" ? "bus" : normalized;
}

export function normalizeTransitMode(value: string | null | undefined): TransitMode {
  switch (String(value ?? "").trim().toUpperCase()) {
    case "WALK":
      return "WALK";
    case "BUS":
      return "BUS";
    case "TRAM":
    case "LIGHT_RAIL":
      return "TRAM";
    case "TROLLEYBUS":
      return "TROLLEYBUS";
    case "TRAIN":
    case "RAIL":
    case "HEAVY_RAIL":
    case "HIGH_SPEED_TRAIN":
    case "INTERCITY_TRAIN":
    case "COMMUTER_TRAIN":
    case "LONG_DISTANCE_TRAIN":
    case "METRO_RAIL":
    case "SUBWAY":
    case "MONORAIL":
      return "TRAIN";
    default:
      return "BUS";
  }
}

export function modeToTransportType(mode: TransitMode): LineType {
  switch (mode) {
    case "TRAM":
      return "tram";
    case "TROLLEYBUS":
      return "trolleybus";
    case "TRAIN":
      return "train";
    case "WALK":
    case "BUS":
    default:
      return "bus";
  }
}

export function toModeLabel(mode: TransitMode): string {
  switch (mode) {
    case "WALK":
      return "Walk";
    case "BUS":
      return "Bus";
    case "TRAM":
      return "Tram";
    case "TROLLEYBUS":
      return "Trolley";
    case "TRAIN":
      return "Train";
    default:
      return "Bus";
  }
}
