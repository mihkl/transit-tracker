import type { StopDeparture } from "@/lib/types";

const SIRI_URL = "https://transport.tallinn.ee/siri-stop-departures.php";
const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  data: StopDeparture[];
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

export async function fetchStopDepartures(
  stopId: string
): Promise<StopDeparture[]> {
  // Check cache
  const cached = cache.get(stopId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(`${SIRI_URL}?stopid=${stopId}`, {
      signal: controller.signal,
    });
    const text = await res.text();
    const departures = parseSiriResponse(text);

    cache.set(stopId, { data: departures, timestamp: Date.now() });
    return departures;
  } catch (err) {
    console.error(
      `SIRI fetch error for stop ${stopId}:`,
      err instanceof Error ? err.message : err
    );
    // Return stale cache if available
    if (cached) return cached.data;
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function parseSiriResponse(text: string): StopDeparture[] {
  const lines = text.split("\n");
  const departures: StopDeparture[] = [];

  // Skip header line and stop info line (first 2 lines)
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
      // Skip malformed lines
    }
  }

  return departures;
}
