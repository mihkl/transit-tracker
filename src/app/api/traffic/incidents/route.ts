import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 30_000;

interface TomTomIncidentResponse {
  incidents?: Array<{
    id: string;
    type: string;
    geometry: {
      type: string;
      coordinates: number[] | number[][];
    };
    properties: {
      iconCategory: number;
      description?: string;
      delay?: number;
      magnitude?: number;
      startTime?: string;
      endTime?: string;
      roadNumbers?: string[];
    };
  }>;
}

// Icon category mapping for display
const ICON_CATEGORIES: Record<number, string> = {
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

function normalizeIncidentsResponse(
  data: TomTomIncidentResponse,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature<GeoJSON.Geometry>[] = [];

  if (!data.incidents) {
    return { type: "FeatureCollection", features: [] };
  }

  for (const incident of data.incidents) {
    if (!incident.geometry) continue;

    let geometry: GeoJSON.Geometry;

    if (incident.geometry.type === "Point") {
      geometry = {
        type: "Point",
        coordinates: incident.geometry.coordinates as number[],
      };
    } else if (
      incident.geometry.type === "LineString" ||
      incident.geometry.type === "MultiPoint"
    ) {
      const coords = incident.geometry.coordinates as number[][];
      geometry = {
        type: "Point",
        coordinates: coords[0],
      };
    } else {
      //skip unsupported geometry types (e.g. polygons for area incidents)
      continue;
    }

    const props = incident.properties;

    features.push({
      type: "Feature",
      geometry,
      properties: {
        id: incident.id,
        type: incident.type || "unknown",
        iconCategory: props.iconCategory ?? 0,
        description:
          ICON_CATEGORIES[props.iconCategory ?? 0] || "Traffic Incident",
        delay: null,
        magnitude: 0,
        startTime: null,
        endTime: null,
        roadNumbers: [],
      },
    });
  }

  return { type: "FeatureCollection", features };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const minLat = searchParams.get("minLat");
  const minLng = searchParams.get("minLng");
  const maxLat = searchParams.get("maxLat");
  const maxLng = searchParams.get("maxLng");

  if (!minLat || !minLng || !maxLat || !maxLng) {
    return NextResponse.json(
      { error: "Missing bounding box parameters" },
      { status: 400 },
    );
  }

  const apiKey = process.env.TOMTOM_API_KEY;
  if (!apiKey) {
    console.error(
      "[Traffic Incidents API] ERROR: TomTom API key not configured",
    );
    return NextResponse.json(
      { error: "TomTom API key not configured" },
      { status: 500 },
    );
  }

  const cacheKey = `incidents:${minLat},${minLng},${maxLat},${maxLng}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  const baseUrl = process.env.TOMTOM_BASE_URL || "https://api.tomtom.com";
  // bbox format: minLon,minLat,maxLon,maxLat
  const url = new URL(`${baseUrl}/traffic/services/5/incidentDetails`);
  url.searchParams.set("bbox", `${minLng},${minLat},${maxLng},${maxLat}`);
  url.searchParams.set(
    "fields",
    "{incidents{type,geometry{type,coordinates},properties{iconCategory}}}",
  );
  url.searchParams.set("key", apiKey);
  url.searchParams.set("language", "en-GB");
  url.searchParams.set("timeValidityFilter", "present");

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[Traffic Incidents API] TomTom API error:",
        response.status,
        errorText,
      );
      return NextResponse.json(
        { error: "Failed to fetch traffic incidents data" },
        { status: response.status },
      );
    }

    const data: TomTomIncidentResponse = await response.json();
    const geoJson = normalizeIncidentsResponse(data);

    cache.set(cacheKey, { data: geoJson, timestamp: Date.now() });

    return NextResponse.json(geoJson);
  } catch (error) {
    console.error("[Traffic Incidents API] Fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch traffic incidents data" },
      { status: 500 },
    );
  }
}
