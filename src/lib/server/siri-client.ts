import type { StopDeparture } from "@/lib/types";
import { fetchWithTimeout } from "./fetch-with-timeout";

const SIRI_URL = "https://transport.tallinn.ee/siri-stop-departures.php";
const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  data: StopDeparture[];
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

export async function fetchStopDepartures(
  stopId: string,
): Promise<StopDeparture[]> {
  const cached = cache.get(stopId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const res = await fetchWithTimeout(`${SIRI_URL}?stopid=${stopId}`);
    const text = await res.text();
    const departures = parseSiriResponse(text);

    cache.set(stopId, { data: departures, timestamp: Date.now() });
    return departures;
  } catch (err) {
    console.error(
      `SIRI fetch error for stop ${stopId}:`,
      err instanceof Error ? err.message : err,
    );
    if (cached) return cached.data;
    return [];
  }
}

function parseSiriResponse(text: string): StopDeparture[] {
  const lines = text.split("\n");
  const departures: StopDeparture[] = [];

  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(",");
    if (parts.length < 6) continue;

    try {
      const expectedTime = parseInt(parts[2], 10);
      const scheduleTime = parseInt(parts[3], 10);

      departures.push({
        transportType: parts[0],
        route: parts[1],
        expectedTime,
        scheduleTime,
        destination: parts[4],
        secondsUntilArrival: parseInt(parts[5], 10),
        delaySeconds: expectedTime - scheduleTime,
      });
    } catch {
      continue;
    }
  }

  return departures;
}
