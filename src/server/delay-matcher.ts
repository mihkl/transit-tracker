import type { DelayStatus } from "@/lib/domain";
import { transitState } from "./transit-state";
import { fetchStopArrivalsAsync } from "./siri-client";
import { getSecondsOfDayInTallinn } from "./time-utils";

const MAX_DEPARTURE_TIME_MATCH_SECONDS = 3 * 60;

export async function matchTransitLegAsync(
  lineNumber: string | undefined,
  departureStopLat: number | undefined,
  departureStopLng: number | undefined,
  scheduledDepartureTime: string | undefined,
) {
  if (
    !lineNumber ||
    departureStopLat == null ||
    departureStopLng == null ||
    !scheduledDepartureTime
  ) {
    return null;
  }

  const scheduledDate = new Date(scheduledDepartureTime);
  if (Number.isNaN(scheduledDate.getTime())) return null;

  const stopId = transitState.getStopIdByCoords(departureStopLat, departureStopLng);
  if (!stopId) return null;

  try {
    const departures = await fetchStopArrivalsAsync(stopId);

    const sameLine = departures.filter((d) => routeMatches(d.route, lineNumber));
    const realtimeSameLine = sameLine.filter((d) => d.hasRealtime);
    if (realtimeSameLine.length === 0) return null;

    const target = getSecondsOfDayInTallinn(scheduledDate);
    const match = pickBestDeparture(realtimeSameLine, target);
    if (!match) return null;
    if (departureTimeDifference(match.scheduleTime, target) > MAX_DEPARTURE_TIME_MATCH_SECONDS) {
      return null;
    }

    const delaySeconds = match.delaySeconds;
    let status: DelayStatus;
    if (Math.abs(delaySeconds) < 30) status = "on_time";
    else if (delaySeconds > 0) status = "delayed";
    else status = "early";

    return {
      estimatedDelaySeconds: delaySeconds,
      status,
    };
  } catch {
    return null;
  }
}

function routeMatches(route: string, lineNumber: string) {
  const a = normalizeRoute(route);
  const b = normalizeRoute(lineNumber);
  return a === b;
}

function normalizeRoute(value: string) {
  const clean = String(value).trim().toLowerCase().replace(/\s+/g, "");
  return clean.replace(/^0+/, "");
}

function isSecondsOfDay(value: number) {
  return Number.isFinite(value) && value >= 0 && value < 172_800;
}

function pickBestDeparture<T extends { scheduleTime: number }>(
  departures: T[],
  targetSecondsOfDay: number,
) {
  if (departures.length === 0) return null;

  const sorted = [...departures].sort((a, b) => {
    const da = departureTimeDifference(a.scheduleTime, targetSecondsOfDay);
    const db = departureTimeDifference(b.scheduleTime, targetSecondsOfDay);
    return da - db;
  });

  return sorted[0];
}

function departureTimeDifference(scheduleTime: number, targetSecondsOfDay: number) {
  if (!Number.isFinite(scheduleTime)) return Number.POSITIVE_INFINITY;
  if (!isSecondsOfDay(scheduleTime)) return Number.POSITIVE_INFINITY;

  const raw = Math.abs(scheduleTime - targetSecondsOfDay);
  return Math.min(raw, 86_400 - raw);
}
