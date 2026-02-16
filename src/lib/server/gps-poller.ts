import type { GpsReading } from "@/lib/types";
import { fetchWithTimeout } from "./fetch-with-timeout";

const GPS_URL = "https://gis.ee/tallinn/gps.php";

interface GeoJsonFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    id: number;
    line: string;
    type: number;
    direction: number;
    destination: string;
  };
}

interface GeoJsonResponse {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
}

export async function pollGps(): Promise<GpsReading[]> {
  const readings: GpsReading[] = [];
  const now = new Date();

  const url = `${GPS_URL}?ver=${Date.now()}`;
  const res = await fetchWithTimeout(url);
  const data: GeoJsonResponse = await res.json();

  for (const feature of data.features) {
    try {
      const { properties, geometry } = feature;
      const [lng, lat] = geometry.coordinates;

      const reading: GpsReading = {
        transportType: properties.type,
        lineNumber: String(properties.line),
        longitude: lng,
        latitude: lat,
        speed: null,
        heading: properties.direction,
        id: properties.id,
        destination: properties.destination || "",
        timestamp: now,
      };

      readings.push(reading);
    } catch {
      continue;
    }
  }

  return readings;
}

export class GpsPollerService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private onData: (readings: GpsReading[]) => void;
  private intervalMs: number;

  constructor(onData: (readings: GpsReading[]) => void, intervalMs = 6_000) {
    this.onData = onData;
    this.intervalMs = intervalMs;
  }

  start(): void {
    if (this.intervalId) return;

    this.poll();

    this.intervalId = setInterval(() => this.poll(), this.intervalMs);
    console.log(`GPS poller started (every ${this.intervalMs / 1000}s)`);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("GPS poller stopped");
    }
  }

  private async poll(): Promise<void> {
    try {
      const readings = await pollGps();
      this.onData(readings);
    } catch (err) {
      console.error(
        "GPS poll error:",
        err instanceof Error ? err.message : err,
      );
    }
  }
}
