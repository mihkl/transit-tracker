import { getLegDelay } from "@/actions";
import type { DelayInfo, RouteLeg } from "@/lib/types";

export async function fetchLegDelay(leg: RouteLeg): Promise<DelayInfo | null> {
  try {
    return await getLegDelay({
      line: leg.lineNumber,
      type: leg.mode,
      depStop: leg.departureStop,
      depLat: leg.departureStopLat,
      depLng: leg.departureStopLng,
      arrStop: leg.arrivalStop,
      arrLat: leg.arrivalStopLat,
      arrLng: leg.arrivalStopLng,
      scheduledDep: leg.scheduledDeparture,
    });
  } catch {
    return null;
  }
}
