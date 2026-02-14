import type {
  GoogleRoutesResponse,
  PlaceSearchResult,
  NominatimResult,
} from "@/lib/types";

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

function buildPlaceName(r: NominatimResult): string {
  const addr = r.address;
  if (addr) {
    const road = addr.road;
    const houseNumber = addr.house_number;
    if (road && houseNumber) return `${road} ${houseNumber}`;
    if (road) return road;
  }
  if (r.display_name) {
    const parts = r.display_name.split(",").map((s) => s.trim());
    if (parts.length >= 2) return `${parts[1]} ${parts[0]}`;
    return parts[0];
  }
  return r.name || "";
}

export async function searchPlaces(
  query: string,
): Promise<PlaceSearchResult[]> {
  const url =
    `https://nominatim.openstreetmap.org/search` +
    `?q=${encodeURIComponent(query)}` +
    `&format=json&limit=5&addressdetails=1` +
    `&viewbox=24.5,59.5,25.0,59.35&bounded=0`;

  const res = await fetch(url, {
    headers: { "User-Agent": "TransitTracker/1.0" },
  });

  const body = await res.text();

  if (!res.ok) {
    console.error(`Nominatim error (${res.status}): ${body}`);
    return [];
  }

  const results: NominatimResult[] = JSON.parse(body);

  return results.map((r) => ({
    name: buildPlaceName(r),
    address: r.display_name || "",
    lat: parseFloat(r.lat) || 0,
    lng: parseFloat(r.lon) || 0,
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
