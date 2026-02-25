import type { DelayStatus, TransitMode, TransportType } from "@/lib/domain";
import { modeToTransportType, normalizeTransitMode, toModeLabel } from "@/lib/domain";

export const TALLINN_CENTER: [number, number] = [59.4372, 24.7536];
export const DEFAULT_ZOOM = 13;

export const TYPE_COLORS: Record<TransportType, string> = {
  bus: "#1565C0",
  tram: "#C62828",
  trolleybus: "#2E7D32",
  train: "#FF9800",
  unknown: "#999",
};

export const MODE_LABELS: Record<TransitMode, string> = {
  WALK: toModeLabel("WALK"),
  BUS: toModeLabel("BUS"),
  TRAM: toModeLabel("TRAM"),
  TROLLEYBUS: toModeLabel("TROLLEYBUS"),
  TRAIN: toModeLabel("TRAIN"),
} as const;

/** Resolves a transport type color from either lowercase ("bus") or uppercase ("BUS") keys. */
export function getTransportColor(type: string): string {
  const direct = type.toLowerCase() as TransportType;
  if (TYPE_COLORS[direct]) return TYPE_COLORS[direct];
  return TYPE_COLORS[modeToTransportType(normalizeTransitMode(type))] || TYPE_COLORS.unknown;
}

export const DELAY_COLORS: Record<DelayStatus, string> = {
  on_time: "#4CAF50",
  delayed: "#F44336",
  early: "#2196F3",
  unknown: "#999",
};

export const LEG_COLORS: Record<TransitMode, string> = {
  WALK: "#999",
  BUS: "#1565C0",
  TRAM: "#C62828",
  TROLLEYBUS: "#2E7D32",
  TRAIN: "#FF9800",
};

export const TYPE_LABELS: Record<TransportType, string> = {
  tram: "Tram",
  trolleybus: "Trolleybus",
  bus: "Bus",
  train: "Train",
  unknown: "Unknown",
};
