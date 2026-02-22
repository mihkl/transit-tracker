"use server";

import { getAllSiriStops } from "@/server/siri-stops";
import { fetchStopArrivals } from "@/server/siri-client";
import type { StopDto, StopArrival } from "@/lib/types";

let allStopsCache: StopDto[] | null = null;

export async function getAllStops(): Promise<StopDto[]> {
  if (allStopsCache) return allStopsCache;
  allStopsCache = await getAllSiriStops();
  return allStopsCache;
}

export async function getStopArrivals(stopId: string): Promise<StopArrival[]> {
  return fetchStopArrivals(stopId);
}
