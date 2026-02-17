import type { GoogleRoutesResponse, PlaceSearchResult } from "@/lib/types";

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

function getApiKey(): string {
  return process.env.GOOGLE_ROUTES_API_KEY || "";
}

export function isConfigured(): boolean {
  const key = getApiKey();
  return !!key && key !== "YOUR_GOOGLE_API_KEY_HERE";
}

export async function computeRoutes(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  departureTime?: string,
  arrivalTime?: string,
): Promise<GoogleRoutesResponse | null> {
  const apiKey = getApiKey();

  const request: Record<string, unknown> = {
    origin: {
      location: { latLng: { latitude: originLat, longitude: originLng } },
    },
    destination: {
      location: { latLng: { latitude: destLat, longitude: destLng } },
    },
    travelMode: "TRANSIT",
    computeAlternativeRoutes: true,
    transitPreferences: {
      routingPreference: "FEWER_TRANSFERS",
    },
  };

  if (departureTime) {
    request.departureTime = departureTime;
  } else if (arrivalTime) {
    request.arrivalTime = arrivalTime;
  }

  const res = await fetch(ROUTES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": [
        "routes.duration",
        "routes.distanceMeters",
        "routes.polyline.encodedPolyline",
        "routes.legs.duration",
        "routes.legs.distanceMeters",
        "routes.legs.polyline.encodedPolyline",
        "routes.legs.steps.travelMode",
        "routes.legs.steps.transitDetails",
        "routes.legs.steps.staticDuration",
        "routes.legs.steps.distanceMeters",
        "routes.legs.steps.polyline.encodedPolyline",
        "routes.legs.steps.transitDetails.stopDetails",
        "routes.legs.steps.transitDetails.transitLine",
        "routes.legs.steps.transitDetails.stopCount",
        "routes.legs.steps.transitDetails.localizedValues",
      ].join(","),
    },
    body: JSON.stringify(request),
  });

  const body = await res.text();

  if (!res.ok) {
    console.error(`Google Routes API error (${res.status}): ${body}`);
    return null;
  }

  return JSON.parse(body) as GoogleRoutesResponse;
}

interface GoogleGeocodingResult {
  formatted_address: string;
  geometry: {
    location: { lat: number; lng: number };
  };
  address_components: {
    long_name: string;
    short_name: string;
    types: string[];
  }[];
}

function buildPlaceNameFromComponents(
  components: GoogleGeocodingResult["address_components"],
): string {
  const find = (type: string) =>
    components.find((c) => c.types.includes(type))?.long_name;

  const poi = find("point_of_interest") || find("establishment");
  if (poi) return poi;

  const route = find("route");
  const streetNumber = find("street_number");
  if (route && streetNumber) return `${route} ${streetNumber}`;
  if (route) return route;

  const neighborhood = find("neighborhood") || find("sublocality");
  if (neighborhood) return neighborhood;

  return components[0]?.long_name || "";
}

export async function searchPlaces(
  query: string,
): Promise<PlaceSearchResult[]> {
  const apiKey = getApiKey();
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${encodeURIComponent("Tallinn " + query)}` +
    `&key=${apiKey}` +
    `&bounds=59.35,24.5%7C59.5,25.0` +
    `&language=et` +
    `&region=ee`;

  const res = await fetch(url);
  const body = await res.text();

  if (!res.ok) {
    console.error(`Google Geocoding error (${res.status}): ${body}`);
    return [];
  }

  const data = JSON.parse(body) as {
    results: GoogleGeocodingResult[];
    status: string;
  };

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    console.error(`Google Geocoding status: ${data.status}`);
    return [];
  }

  return data.results.slice(0, 5).map((r) => ({
    name: buildPlaceNameFromComponents(r.address_components),
    address: r.formatted_address,
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
  }));
}

export function decodePolyline(encoded: string): number[][] {
  const points: number[][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}
