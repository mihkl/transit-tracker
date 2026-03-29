import type { StopArrival } from "@/lib/types";
import { normalizeTransportType } from "@/lib/domain";
import { stopArrivalSchema } from "@/lib/schemas";
import { captureExpectedMessage } from "@/lib/monitoring";
import { fetchWithTimeoutAsync } from "./fetch-with-timeout";
import { getSecondsOfDayInTallinn } from "./time-utils";

const SIRI_URL = "https://transport.tallinn.ee/siri-stop-departures.php";
const CACHE_TTL_MS = 5_000;

interface CacheEntry {
  data: StopArrival[];
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

function toRawStopId(stopId: string) {
  return stopId.includes(":") ? (stopId.split(":").pop() ?? stopId) : stopId;
}

function toSecondsSinceMidnight(now: Date) {
  return getSecondsOfDayInTallinn(now);
}

function computeSecondsUntilFromClock(nowSeconds: number, targetSeconds: number) {
  let delta = targetSeconds - nowSeconds;
  if (delta < 0) delta += 24 * 60 * 60;
  return delta;
}

function hasRealtimeData(expectedTime: number, scheduleTime: number, realtimeMarker: string) {
  if (expectedTime !== scheduleTime) return true;

  const marker = realtimeMarker.trim().toLowerCase();
  if (!marker) return false;

  return (
    marker === "1" ||
    marker === "r" ||
    marker === "rt" ||
    marker === "realtime" ||
    marker === "real-time" ||
    marker === "real_time" ||
    marker === "true" ||
    marker === "yes"
  );
}

/**
 * Parses one departure line from the SIRI stop-board feed.
 *
 * The feed format is CSV but destination names can contain commas, so we
 * scan the first 4 fields from the left (transportType, route, expectedTime,
 * scheduleTime) and the last field from the right (realtimeMarker). Everything
 * in between is treated as the destination, preserving embedded commas.
 */
function parseSiriLine(line: string) {
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
  let destination: string;
  let realtimeMarker = "";
  let secondsUntilArrival: number | null = null;

  const tailParts = afterFixed.split(",");

  if (tailParts.length > 1) {
    realtimeMarker = tailParts.pop()?.trim() ?? "";

    const trailingNumericParts: string[] = [];
    while (tailParts.length > 0) {
      const candidate = tailParts[tailParts.length - 1].trim();
      if (!/^\d+$/.test(candidate)) break;
      trailingNumericParts.unshift(candidate);
      tailParts.pop();
    }

    if (trailingNumericParts.length > 0) {
      const siriEtaSeconds = Number(trailingNumericParts[trailingNumericParts.length - 1]);
      if (Number.isFinite(siriEtaSeconds) && siriEtaSeconds >= 0) {
        secondsUntilArrival = siriEtaSeconds;
      }
    }

    destination = tailParts.join(",").trim();
    if (!destination) {
      destination = afterFixed.trim();
      realtimeMarker = "";
      secondsUntilArrival = null;
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
    secondsUntilArrival,
  };
}

async function fetchFromSiriAsync(stopId: string) {
  const rawStopId = toRawStopId(stopId);
  const url = `${SIRI_URL}?stopid=${encodeURIComponent(rawStopId)}`;
  const res = await fetchWithTimeoutAsync(url, 10_000);
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

    const {
      transportType,
      route,
      expectedTime,
      scheduleTime,
      destination,
      realtimeMarker,
      secondsUntilArrival,
    } =
      parsed;
    const delaySeconds = expectedTime - scheduleTime;
    const hasRealtime = hasRealtimeData(expectedTime, scheduleTime, realtimeMarker);

    const parsedDeparture = stopArrivalSchema.safeParse({
      transportType,
      route,
      expectedTime,
      scheduleTime,
      hasRealtime,
      destination,
      secondsUntilArrival: secondsUntilArrival ?? computeSecondsUntilFromClock(nowSeconds, expectedTime),
      delaySeconds,
    });
    if (!parsedDeparture.success) continue;
    departures.push(parsedDeparture.data);
  }

  departures.sort((a, b) => a.secondsUntilArrival - b.secondsUntilArrival);
  return departures;
}

export async function fetchStopArrivalsAsync(stopId: string) {
  const cached = cache.get(stopId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const departures = await fetchFromSiriAsync(stopId);
    cache.set(stopId, { data: departures, timestamp: Date.now() });
    return departures;
  } catch (err) {
    captureExpectedMessage(`SIRI departures fetch error for stop ${stopId}`, {
      area: "siri",
      extra: { stopId, error: err instanceof Error ? err.message : err },
    });
    if (cached) return cached.data;
    return [];
  }
}
