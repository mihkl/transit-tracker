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

function toPlaceResourceName(placeId: string): string {
  return placeId.startsWith("places/") ? placeId : `places/${placeId}`;
}

async function fetchPlaceDetailsNew(
  placeId: string,
  apiKey: string,
  depth = 0,
): Promise<PlacesNewDetailsResponse | null> {
  const resourceName = toPlaceResourceName(placeId);
  const res = await fetch(`https://places.googleapis.com/v1/${resourceName}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "id,displayName,formattedAddress,location,businessStatus,movedPlace,movedPlaceId",
    },
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
    return fetchPlaceDetailsNew(nextPlaceId, apiKey, depth + 1);
  }

  return data;
}

function buildPlaceNameFromComponents(
  components: GoogleGeocodingResult["address_components"],
): string {
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

export async function searchPlaces(query: string): Promise<PlaceSearchResult[]> {
  const placesApiKey = getApiKey();

  try {
    if (placesApiKey) {
      const searchRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": placesApiKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.location",
        },
        body: JSON.stringify({
          textQuery: query,
          languageCode: "et",
          regionCode: "EE",
          pageSize: 5,
          locationBias: {
            rectangle: {
              low: { latitude: 59.35, longitude: 24.5 },
              high: { latitude: 59.5, longitude: 25.0 },
            },
          },
        }),
      });

      const searchBody = await searchRes.text();
      if (!searchRes.ok) {
        console.error(`Places Text Search (New) error (${searchRes.status}): ${searchBody}`);
      } else {
        const searchData = JSON.parse(searchBody) as PlacesNewSearchResponse;
        const searchPlaces = (searchData.places ?? []).filter((p) => !!p.id);

        if (searchPlaces.length > 0) {
          const detailsList = await Promise.all(
            searchPlaces.slice(0, 5).map(async (p) => {
              const details = await fetchPlaceDetailsNew(p.id!, placesApiKey);
              return { search: p, details };
            }),
          );

          const enriched = detailsList
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
            .filter((p): p is PlaceSearchResult => p !== null);

          if (enriched.length > 0) return enriched;
        }
      }
    }
  } catch (err) {
    console.warn("Places (New) search/details failed, falling back to Geocoding:", err);
  }

  const apiKey = getApiKey();
  const geocodeUrl =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${encodeURIComponent("Tallinn " + query)}` +
    `&key=${apiKey}` +
    `&bounds=59.35,24.5%7C59.5,25.0` +
    `&language=et` +
    `&region=ee`;

  const res = await fetch(geocodeUrl);
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
