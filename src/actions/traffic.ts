"use server";

import { env } from "@/lib/env";
import { z } from "zod";

export interface TrafficFlowTileInfo {
  tileUrlTemplate: string;
  attribution: string;
  maxZoom: number;
  minZoom: number;
}

export interface TrafficIncidentFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: number[] };
  properties: {
    id: string;
    type: string;
    iconCategory: number;
    description: string;
    delay: number | null;
    magnitude: number;
    startTime: string | null;
    endTime: string | null;
    roadNumbers: string[];
  };
}

export interface TrafficIncidentCollection {
  type: "FeatureCollection";
  features: TrafficIncidentFeature[];
}

interface TrafficCacheEntry {
  data: unknown;
  timestamp: number;
}

const trafficCache = new Map<string, TrafficCacheEntry>();
const TRAFFIC_CACHE_TTL = 30_000;

export async function getTrafficFlowAsync() {
  const cacheKey = "flow:tileinfo:relative0";
  const cached = trafficCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < TRAFFIC_CACHE_TTL) {
    return cached.data as TrafficFlowTileInfo;
  }

  const apiKey = env.TOMTOM_API_KEY;
  if (!apiKey) throw new Error("TomTom API key not configured");

  const baseUrl = env.TOMTOM_BASE_URL;
  const result: TrafficFlowTileInfo = {
    tileUrlTemplate: `${baseUrl}/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${apiKey}`,
    attribution: "© TomTom",
    maxZoom: 22,
    minZoom: 0,
  };

  trafficCache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}

const INCIDENT_ICON_CATEGORIES: Record<number, string> = {
  0: "Unknown",
  1: "Accident",
  2: "Fog",
  3: "Dangerous Conditions",
  4: "Rain",
  5: "Ice",
  6: "Jam",
  7: "Lane Closed",
  8: "Road Closed",
  9: "Road Works",
  10: "Wind",
  11: "Flooding",
  14: "Broken Down Vehicle",
};

const rawTomTomIncidentSchema = z.object({
  id: z.string().optional(),
  type: z.string().catch("unknown"),
  geometry: z.object({
    type: z.string(),
    coordinates: z.union([z.array(z.number()), z.array(z.array(z.number()))]),
  }),
  properties: z.object({
    iconCategory: z.number().catch(0),
  }),
});

const tomTomIncidentsResponseSchema = z.object({
  incidents: z.array(rawTomTomIncidentSchema).optional(),
});

export async function getTrafficIncidentsAsync(bounds: {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}) {
  const { minLat, minLng, maxLat, maxLng } = bounds;
  const cacheKey = `incidents:${minLat},${minLng},${maxLat},${maxLng}`;
  const cached = trafficCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < TRAFFIC_CACHE_TTL) {
    return cached.data as TrafficIncidentCollection;
  }

  const apiKey = env.TOMTOM_SERVER_API_KEY;
  if (!apiKey) throw new Error("TomTom API key not configured");

  const baseUrl = env.TOMTOM_BASE_URL;
  const url = new URL(`${baseUrl}/traffic/services/5/incidentDetails`);
  url.searchParams.set("bbox", `${minLng},${minLat},${maxLng},${maxLat}`);
  url.searchParams.set(
    "fields",
    "{incidents{id,type,geometry{type,coordinates},properties{iconCategory}}}",
  );
  url.searchParams.set("key", apiKey);
  url.searchParams.set("language", "en-GB");
  url.searchParams.set("timeValidityFilter", "present");

  const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`TomTom API error: ${response.status}`);

  const raw = await response.json();
  const parsed = tomTomIncidentsResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `TomTom incidents response validation failed: ${parsed.error.issues[0]?.message ?? parsed.error.message}`,
    );
  }
  const data = parsed.data;
  const features: TrafficIncidentFeature[] = [];

  for (const incident of data.incidents ?? []) {
    if (!incident.geometry) continue;

    let coordinates: number[];
    if (incident.geometry.type === "Point") {
      coordinates = incident.geometry.coordinates as number[];
    } else if (incident.geometry.type === "LineString" || incident.geometry.type === "MultiPoint") {
      coordinates = (incident.geometry.coordinates as number[][])[0];
    } else {
      continue;
    }

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates },
      properties: {
        id: incident.id ?? crypto.randomUUID(),
        type: incident.type || "unknown",
        iconCategory: incident.properties.iconCategory ?? 0,
        description:
          INCIDENT_ICON_CATEGORIES[incident.properties.iconCategory ?? 0] || "Traffic Incident",
        delay: null,
        magnitude: 0,
        startTime: null,
        endTime: null,
        roadNumbers: [],
      },
    });
  }

  const result: TrafficIncidentCollection = { type: "FeatureCollection", features };
  trafficCache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}
