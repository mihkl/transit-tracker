import type { StopDto } from "@/lib/types";
import * as fs from "node:fs/promises";
import path from "node:path";

const CACHE_TTL_MS = 30 * 60 * 1000;

interface CacheEntry {
  stops: StopDto[];
  timestamp: number;
}

let cache: CacheEntry | null = null;

async function loadStops(): Promise<StopDto[]> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return cache.stops;
  }

  const filePath = path.join(process.cwd(), "public", "gtfs-preprocessed", "stops.json");
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as Array<{
    stopId: string;
    stopName: string;
    latitude: number;
    longitude: number;
    stopDesc?: string;
    stopArea?: string;
  }>;

  const stops: StopDto[] = parsed
    .filter(
      (s) =>
        !!s.stopId && !!s.stopName && Number.isFinite(s.latitude) && Number.isFinite(s.longitude),
    )
    .map((s) => ({
      stopId: String(s.stopId),
      stopName: s.stopName,
      latitude: s.latitude,
      longitude: s.longitude,
      stopDesc: s.stopDesc,
      stopArea: s.stopArea,
    }));

  stops.sort((a, b) => a.stopName.localeCompare(b.stopName));
  cache = { stops, timestamp: Date.now() };
  return stops;
}

export async function getAllSiriStops(): Promise<StopDto[]> {
  return loadStops();
}
