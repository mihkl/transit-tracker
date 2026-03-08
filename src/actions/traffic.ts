"use server";

import { headers } from "next/headers";
import { env } from "@/lib/env";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRateLimitIdentifier } from "@/lib/request-client";
import { trafficBoundsSchema } from "@/lib/schemas";
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

function emptyTrafficIncidents(): TrafficIncidentCollection {
  return { type: "FeatureCollection", features: [] };
}

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
}, clientId?: string) {
  const parsedBounds = trafficBoundsSchema.parse(bounds);
  const requester = getRateLimitIdentifier(await headers(), clientId);
  const limit = await consumeRateLimit("traffic", `traffic:${requester}`);
  if (!limit.ok) {
    throw new Error("Too many traffic requests. Please wait a moment.");
  }

  const minLat = Math.max(-90, Math.min(90, parsedBounds.minLat));
  const minLng = Math.max(-180, Math.min(180, parsedBounds.minLng));
  const maxLat = Math.max(-90, Math.min(90, parsedBounds.maxLat));
  const maxLng = Math.max(-180, Math.min(180, parsedBounds.maxLng));

  if (maxLat - minLat > 2 || maxLng - minLng > 2) {
    throw new Error("Traffic bounds are too large");
  }

  const round = (value: number) => Number(value.toFixed(3));
  const normalizedBounds = {
    minLat: round(minLat),
    minLng: round(minLng),
    maxLat: round(maxLat),
    maxLng: round(maxLng),
  };

  const cacheKey = `incidents:${normalizedBounds.minLat},${normalizedBounds.minLng},${normalizedBounds.maxLat},${normalizedBounds.maxLng}`;
  const cached = trafficCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < TRAFFIC_CACHE_TTL) {
    return cached.data as TrafficIncidentCollection;
  }

  const apiKey = env.TOMTOM_SERVER_API_KEY;
  if (!apiKey) {
    return emptyTrafficIncidents();
  }

  const baseUrl = env.TOMTOM_BASE_URL;
  const url = new URL(`${baseUrl}/traffic/services/5/incidentDetails`);
  url.searchParams.set(
    "bbox",
    `${normalizedBounds.minLng},${normalizedBounds.minLat},${normalizedBounds.maxLng},${normalizedBounds.maxLat}`,
  );
  url.searchParams.set(
    "fields",
    "{incidents{type,geometry{type,coordinates},properties{iconCategory}}}",
  );
  url.searchParams.set("key", apiKey);
  url.searchParams.set("language", "en-GB");
  url.searchParams.set("timeValidityFilter", "present");

  const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.warn(`TomTom incidents unavailable (${response.status}): ${body}`);
    return emptyTrafficIncidents();
  }

  const raw = await response.json();
  const parsed = tomTomIncidentsResponseSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn(
      `TomTom incidents response validation failed: ${parsed.error.issues[0]?.message ?? parsed.error.message}`,
    );
    return emptyTrafficIncidents();
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
