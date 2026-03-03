import type { GoogleRoutesResponse, PlaceSearchResult } from "@/lib/types";

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const API_TIMEOUT = 10_000;
const HARJUMAA_BOUNDS = {
  minLat: 58.95,
  maxLat: 59.85,
  minLng: 23.45,
  maxLng: 25.95,
} as const;

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

interface PlacesNewLocation {
  latitude: number;
  longitude: number;
}

interface PlacesNewDisplayName {
  text?: string;
}

interface PlacesNewSearchPlace {
  id?: string;
  displayName?: PlacesNewDisplayName;
  formattedAddress?: string;
  location?: PlacesNewLocation;
}

interface PlacesNewSearchResponse {
  places?: PlacesNewSearchPlace[];
}

interface PlacesNewDetailsResponse {
  id?: string;
  displayName?: PlacesNewDisplayName;
  formattedAddress?: string;
  location?: PlacesNewLocation;
  businessStatus?: string;
  movedPlace?: string;
  movedPlaceId?: string;
}

function getApiKey() {
  return process.env.GOOGLE_ROUTES_API_KEY || "";
}

function isWithinHarjumaa(lat: number, lng: number) {
  return (
    lat >= HARJUMAA_BOUNDS.minLat &&
    lat <= HARJUMAA_BOUNDS.maxLat &&
    lng >= HARJUMAA_BOUNDS.minLng &&
    lng <= HARJUMAA_BOUNDS.maxLng
  );
}

export function isConfigured() {
  const key = getApiKey();
  return !!key && key !== "YOUR_GOOGLE_API_KEY_HERE";
}

export async function computeRoutesAsync(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  departureTime?: string,
  arrivalTime?: string,
) {
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
    signal: AbortSignal.timeout(API_TIMEOUT),
  });

  const body = await res.text();

  if (!res.ok) {
    console.error(`Google Routes API error (${res.status}): ${body}`);
    return null;
  }

  try {
    return JSON.parse(body) as GoogleRoutesResponse;
  } catch {
    console.error("Google Routes API returned invalid JSON:", body);
    return null;
  }
}

export async function searchPlacesAsync(query: string) {
  const apiKey = getApiKey();

  try {
    if (apiKey) {
      const results = await searchPlacesNewAsync(query, apiKey);
      if (results.length > 0) return results;
    }
  } catch (err) {
    console.warn("Places (New) search/details failed, falling back to Geocoding:", err);
  }

  return searchPlacesGeocodingAsync(query, apiKey);
}

async function searchPlacesNewAsync(query: string, apiKey: string) {
  const searchRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location",
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: "et",
      regionCode: "EE",
      pageSize: 5,
      locationRestriction: {
        rectangle: {
          low: { latitude: HARJUMAA_BOUNDS.minLat, longitude: HARJUMAA_BOUNDS.minLng },
          high: { latitude: HARJUMAA_BOUNDS.maxLat, longitude: HARJUMAA_BOUNDS.maxLng },
        },
      },
    }),
    signal: AbortSignal.timeout(API_TIMEOUT),
  });

  const searchBody = await searchRes.text();
  if (!searchRes.ok) {
    console.error(`Places Text Search (New) error (${searchRes.status}): ${searchBody}`);
    return [];
  }

  const searchData = JSON.parse(searchBody) as PlacesNewSearchResponse;
  const searchPlaces = (searchData.places ?? []).filter((p) => !!p.id);
  if (searchPlaces.length === 0) return [];

  const detailsList = await Promise.all(
    searchPlaces.slice(0, 5).map(async (p) => {
      const details = await fetchPlaceDetailsNewAsync(p.id!, apiKey);
      return { search: p, details };
    }),
  );

  return detailsList
    .map(({ search, details }) => {
      const location = details?.location || search.location;
      const name =
        details?.displayName?.text?.trim() || search.displayName?.text?.trim() || "";
      const address = details?.formattedAddress || search.formattedAddress || "";

      if (!location || !name || !address) return null;
      return {
        name,
        address,
        lat: location.latitude,
        lng: location.longitude,
      } satisfies PlaceSearchResult;
    })
    .filter(
      (p): p is PlaceSearchResult =>
        p !== null && isWithinHarjumaa(p.lat, p.lng),
    );
}

function toPlaceResourceName(placeId: string) {
  return placeId.startsWith("places/") ? placeId : `places/${placeId}`;
}

async function fetchPlaceDetailsNewAsync(placeId: string, apiKey: string, depth = 0) {
  const resourceName = toPlaceResourceName(placeId);
  const res = await fetch(`https://places.googleapis.com/v1/${resourceName}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "id,displayName,formattedAddress,location,businessStatus,movedPlace,movedPlaceId",
    },
    signal: AbortSignal.timeout(API_TIMEOUT),
  });

  const body = await res.text();
  if (!res.ok) {
    console.error(`Place Details (New) error (${res.status}): ${body}`);
    return null;
  }

  const data = JSON.parse(body) as PlacesNewDetailsResponse;
  const hasMoved =
    data.businessStatus === "CLOSED_PERMANENTLY" && (data.movedPlaceId || data.movedPlace);

  if (hasMoved && depth < 3) {
    const nextPlaceId = data.movedPlaceId || data.movedPlace!;
    return fetchPlaceDetailsNewAsync(nextPlaceId, apiKey, depth + 1);
  }

  return data;
}

async function searchPlacesGeocodingAsync(query: string, apiKey: string) {
  const geocodeUrl =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${encodeURIComponent("Tallinn " + query)}` +
    `&key=${apiKey}` +
    `&bounds=${HARJUMAA_BOUNDS.minLat},${HARJUMAA_BOUNDS.minLng}%7C${HARJUMAA_BOUNDS.maxLat},${HARJUMAA_BOUNDS.maxLng}` +
    `&language=et` +
    `&region=ee`;

  const res = await fetch(geocodeUrl, { signal: AbortSignal.timeout(API_TIMEOUT) });
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

  return data.results
    .map((r) => ({
      name: buildPlaceNameFromComponents(r.address_components),
      address: r.formatted_address,
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
    }))
    .filter((p) => isWithinHarjumaa(p.lat, p.lng))
    .slice(0, 5);
}

function buildPlaceNameFromComponents(
  components: GoogleGeocodingResult["address_components"],
) {
  const find = (type: string) => components.find((c) => c.types.includes(type))?.long_name;

  const poi =
    find("point_of_interest") ||
    find("establishment") ||
    find("university") ||
    find("school") ||
    find("hospital") ||
    find("airport") ||
    find("premise") ||
    find("subpremise");
  if (poi) return poi;

  const route = find("route");
  const streetNumber = find("street_number");
  if (route && streetNumber) return `${route} ${streetNumber}`;
  if (route) return route;

  const neighborhood = find("neighborhood") || find("sublocality");
  if (neighborhood) return neighborhood;

  return components[0]?.long_name || "";
}

export function decodePolyline(encoded: string) {
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
