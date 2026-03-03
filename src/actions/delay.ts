"use server";

import { transitState } from "@/server/transit-state";
import { matchTransitLegAsync } from "@/server/delay-matcher";

export interface LegDelayParams {
  line?: string;
  depLat?: number;
  depLng?: number;
  scheduledDep?: string;
}

export async function getLegDelayAsync(params: LegDelayParams) {
  await transitState.initializeAsync();
  const delay = await matchTransitLegAsync(
    params.line,
    params.depLat,
    params.depLng,
    params.scheduledDep,
  );
  return delay ?? null;
}
