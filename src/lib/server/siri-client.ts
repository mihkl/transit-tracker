import type { StopDeparture } from "@/lib/types";
import { fetchWithTimeout } from "./fetch-with-timeout";

const SIRI_URL = "https://transport.tallinn.ee/siri-stop-departures.php";
const CACHE_TTL_MS = 5_000;

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

/**
 * Parses the SIRI stop departures response.
 * Format: line 0 = stop name, line 1 = metadata, lines 2+ = departure rows.
 * Each departure row: transportType,route,expectedTime,scheduleTime,destination,secondsUntilArrival
 * The destination field may contain commas, so we parse from both ends:
 * first 4 fields by indexOf, last field by lastIndexOf, and everything between is the destination.
 */
function parseSiriResponse(text: string): StopDeparture[] {
  const lines = text.split("\n");
  const departures: StopDeparture[] = [];

  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      // Find the first 4 commas (transportType, route, expectedTime, scheduleTime)
      let pos = 0;
      const commaPositions: number[] = [];
      for (let c = 0; c < 4 && pos < line.length; c++) {
        const idx = line.indexOf(",", pos);
        if (idx === -1) break;
        commaPositions.push(idx);
        pos = idx + 1;
      }

      // Find the last comma (before secondsUntilArrival)
      const lastComma = line.lastIndexOf(",");

      if (commaPositions.length < 4 || lastComma <= commaPositions[3]) continue;

      const transportType = line.slice(0, commaPositions[0]);
      const route = line.slice(commaPositions[0] + 1, commaPositions[1]);
      const expectedTime = parseInt(
        line.slice(commaPositions[1] + 1, commaPositions[2]),
        10,
      );
      const scheduleTime = parseInt(
        line.slice(commaPositions[2] + 1, commaPositions[3]),
        10,
      );
      const destination = line.slice(commaPositions[3] + 1, lastComma);
      const secondsUntilArrival = parseInt(line.slice(lastComma + 1), 10);

      departures.push({
        transportType,
        route,
        expectedTime,
        scheduleTime,
        destination,
        secondsUntilArrival,
        delaySeconds: expectedTime - scheduleTime,
      });
    } catch {
      continue;
    }
  }

  return departures;
}
