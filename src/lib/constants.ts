export const TALLINN_CENTER: [number, number] = [59.437, 24.745];
export const DEFAULT_ZOOM = 13;

export const TYPE_COLORS: Record<string, string> = {
  bus: "#2196F3",
  tram: "#F44336",
  trolleybus: "#4CAF50",
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

export const MODE_COLORS: Record<string, string> = {
  WALK: "#999",
  BUS: "#2196F3",
  TRAM: "#F44336",
  TROLLEYBUS: "#4CAF50",
  TRAIN: "#FF9800",
};

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
  TRAIN: "#E65100",
};

export const TYPE_LABELS: Record<string, string> = {
  tram: "Tram",
  trolleybus: "Trolleybus",
  bus: "Bus",
  train: "Train",
  unknown: "Unknown",
};
