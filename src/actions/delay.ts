"use server";

import { transitState } from "@/server/transit-state";
import { matchTransitLeg } from "@/server/delay-matcher";
import type { DelayInfo } from "@/lib/types";

export interface LegDelayParams {
  line?: string;
  type?: string;
  depStop?: string;
  depLat?: number;
  depLng?: number;
  arrStop?: string;
  arrLat?: number;
  arrLng?: number;
  scheduledDep?: string;
}

export async function getLegDelay(params: LegDelayParams): Promise<DelayInfo | null> {
  await transitState.initialize();
  const delay = await matchTransitLeg(
    params.line,
    params.type,
    params.depStop,
    params.depLat,
    params.depLng,
    params.scheduledDep,
    params.arrStop,
    params.arrLat,
    params.arrLng,
  );
  return delay ?? null;
}
