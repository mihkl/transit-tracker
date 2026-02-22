import type { StopArrival } from "@/lib/types";
import { fetchWithTimeout } from "./fetch-with-timeout";
import { getSecondsOfDayInTallinn } from "./time-utils";

const SIRI_URL = "https://transport.tallinn.ee/siri-stop-departures.php";
const CACHE_TTL_MS = 5_000;

interface CacheEntry {
  data: StopArrival[];
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

function toRawStopId(stopId: string): string {
  return stopId.includes(":") ? (stopId.split(":").pop() ?? stopId) : stopId;
}

function toSecondsSinceMidnight(now: Date): number {
  return getSecondsOfDayInTallinn(now);
}

function computeSecondsUntilFromClock(nowSeconds: number, targetSeconds: number): number {
  let delta = targetSeconds - nowSeconds;
  if (delta < 0) delta += 24 * 60 * 60;
  return delta;
}

function normalizeTransportType(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (value === "tram") return "tram";
  if (value === "trolleybus") return "trolleybus";
  if (value === "train" || value === "rail") return "train";
  return "bus";
}

/**
 * Parses one departure line from the SIRI stop-board feed.
 *
 * The feed format is CSV but destination names can contain commas, so we
 * scan the first 4 fields from the left (transportType, route, expectedTime,
 * scheduleTime) and the last field from the right (realtimeMarker). Everything
 * in between is treated as the destination, preserving embedded commas.
 */
function parseSiriLine(line: string): {
  transportType: string;
  route: string;
  expectedTime: number;
  scheduleTime: number;
  destination: string;
  realtimeMarker: string;
} | null {
  // Extract first 4 fixed fields by walking from the left.
  let pos = 0;
  const ends: number[] = [];
  for (let f = 0; f < 4 && pos < line.length; f++) {
    const idx = line.indexOf(",", pos);
    if (idx === -1) break;
    ends.push(idx);
    pos = idx + 1;
  }
  if (ends.length < 4) return null;

  const transportType = line.slice(0, ends[0]);
  const route = line.slice(ends[0] + 1, ends[1]).trim();
  const expectedTime = Number(line.slice(ends[1] + 1, ends[2]));
  const scheduleTime = Number(line.slice(ends[2] + 1, ends[3]));

  if (!route) return null;
  if (!Number.isFinite(expectedTime) || !Number.isFinite(scheduleTime)) return null;

  // Everything after the 4th comma: "destination[,optional trailing fields]"
  // The realtimeMarker is the last comma-delimited token (may be empty string).
  const afterFixed = line.slice(ends[3] + 1);
  const lastComma = afterFixed.lastIndexOf(",");
  let destination: string;
  let realtimeMarker = "";

  if (lastComma > 0) {
    destination = afterFixed.slice(0, lastComma).trim();
    realtimeMarker = afterFixed.slice(lastComma + 1).trim();
    // If splitting left us with an empty destination, treat the whole tail as destination.
    if (!destination) {
      destination = afterFixed.trim();
      realtimeMarker = "";
    }
  } else {
    destination = afterFixed.trim();
  }

  // Strip any trailing ",<digits>" segments from destination. The SIRI feed
  // sometimes includes extra numeric fields (e.g. a stop-sequence count or
  // secondsUntilArrival) between the destination name and the realtimeMarker.
  // A destination that ends in bare comma-then-digits is almost certainly a
  // spurious field rather than part of the place name.
  destination = destination.replace(/(?:,\s*\d+)+$/, "").trim();

  return {
    transportType: normalizeTransportType(transportType),
    route,
    expectedTime,
    scheduleTime,
    destination,
    realtimeMarker,
  };
}

async function fetchFromSiri(stopId: string): Promise<StopArrival[]> {
  const rawStopId = toRawStopId(stopId);
  const url = `${SIRI_URL}?stopid=${encodeURIComponent(rawStopId)}`;
  const res = await fetchWithTimeout(url, 10_000);
  if (!res.ok) {
    throw new Error(`SIRI API error: ${res.status}`);
  }

  const body = await res.text();
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 3) return [];
  if (lines[0].startsWith("ERROR:")) return [];

  const nowSeconds = toSecondsSinceMidnight(new Date());
  const departures: StopArrival[] = [];

  for (let i = 2; i < lines.length; i += 1) {
    const parsed = parseSiriLine(lines[i]);
    if (!parsed) continue;

    const { transportType, route, expectedTime, scheduleTime, destination } =
      parsed;
    const delaySeconds = expectedTime - scheduleTime;

    departures.push({
      transportType,
      route,
      expectedTime,
      scheduleTime,
      destination,
      secondsUntilArrival: computeSecondsUntilFromClock(nowSeconds, expectedTime),
      delaySeconds,
    });
  }

  departures.sort((a, b) => a.secondsUntilArrival - b.secondsUntilArrival);
  return departures;
}

export async function fetchStopArrivals(stopId: string): Promise<StopArrival[]> {
  const cached = cache.get(stopId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const departures = await fetchFromSiri(stopId);
    cache.set(stopId, { data: departures, timestamp: Date.now() });
    return departures;
  } catch (err) {
    console.error(
      `SIRI departures fetch error for stop ${stopId}:`,
      err instanceof Error ? err.message : err,
    );
    if (cached) return cached.data;
    return [];
  }
}
