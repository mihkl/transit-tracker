export const TALLINN_CENTER: [number, number] = [59.4372, 24.7536];
export const DEFAULT_ZOOM = 13;

export const TYPE_COLORS: Record<string, string> = {
  bus: "#1565C0",
  tram: "#C62828",
  trolleybus: "#2E7D32",
  train: "#FF9800",
  unknown: "#999",
};

export const MODE_LABELS: Record<string, string> = {
  WALK: "Walk",
  BUS: "Bus",
  TRAM: "Tram",
  TROLLEYBUS: "Trolley",
  TRAIN: "Train",
};

/** Resolves a transport type color from either lowercase ("bus") or uppercase ("BUS") keys. */
export function getTransportColor(type: string): string {
  return TYPE_COLORS[type] || TYPE_COLORS[type.toLowerCase()] || "#999";
}

export const DELAY_COLORS: Record<string, string> = {
  on_time: "#4CAF50",
  delayed: "#F44336",
  early: "#2196F3",
  unknown: "#999",
};

export const LEG_COLORS: Record<string, string> = {
  WALK: "#999",
  BUS: "#1565C0",
  TRAM: "#C62828",
  TROLLEYBUS: "#2E7D32",
  TRAIN: "#FF9800",
};

export const TYPE_LABELS: Record<string, string> = {
  tram: "Tram",
  trolleybus: "Trolleybus",
  bus: "Bus",
  train: "Train",
  unknown: "Unknown",
};
