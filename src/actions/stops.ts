"use server";

import { getAllSiriStops } from "@/server/siri-stops";
import { fetchStopDepartures } from "@/server/siri-client";
import type { StopDto, StopDeparture } from "@/lib/types";

let allStopsCache: StopDto[] | null = null;

export async function getAllStops(): Promise<StopDto[]> {
  if (allStopsCache) return allStopsCache;
  allStopsCache = await getAllSiriStops();
  return allStopsCache;
}

export async function getStopDepartures(stopId: string): Promise<StopDeparture[]> {
  return fetchStopDepartures(stopId);
}
