import { getLegDelayAsync } from "@/actions";
import type { RouteLeg } from "@/lib/types";

export async function fetchLegDelayAsync(leg: RouteLeg) {
  try {
    return await getLegDelayAsync({
      line: leg.lineNumber,
      depLat: leg.departureStopLat,
      depLng: leg.departureStopLng,
      scheduledDep: leg.scheduledDeparture,
    });
  } catch {
    return null;
  }
}
