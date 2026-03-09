"use server";

import { transitState } from "@/server/transit-state";
import { matchTransitLegAsync } from "@/server/delay-matcher";
import { legDelayParamsSchema } from "@/lib/schemas";

interface LegDelayParams {
  line?: string;
  depLat?: number;
  depLng?: number;
  scheduledDep?: string;
}

export async function getLegDelayAsync(params: LegDelayParams) {
  const parsedParams = legDelayParamsSchema.parse(params);
  await transitState.initializeAsync();
  const delay = await matchTransitLegAsync(
    parsedParams.line,
    parsedParams.depLat,
    parsedParams.depLng,
    parsedParams.scheduledDep,
  );
  return delay ?? null;
}
