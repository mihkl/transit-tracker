"use server";

import { getCachedStopsAsync } from "@/server/stops-cache";
import { fetchStopArrivalsAsync } from "@/server/siri-client";
import type { StopDto } from "@/lib/types";
import { stopIdSchema } from "@/lib/schemas";

let allStopsCache: StopDto[] | null = null;

export async function getAllStopsAsync() {
  if (allStopsCache) return allStopsCache;
  allStopsCache = await getCachedStopsAsync();
  return allStopsCache;
}

export async function getStopArrivalsAsync(stopId: string) {
  const parsedStopId = stopIdSchema.safeParse(stopId);
  if (!parsedStopId.success) return [];
  return fetchStopArrivalsAsync(parsedStopId.data);
}
