import type { GoogleRoutesResponse, PlaceSearchResult } from "@/lib/types";
import { env } from "@/lib/env";
import { captureExpectedMessage } from "@/lib/monitoring";
import { z } from "zod";

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

const googleRoutesResponseSchema: z.ZodType<GoogleRoutesResponse> = z.object({
  routes: z.array(
    z.object({
      duration: z.string(),
      distanceMeters: z.number(),
      polyline: z.object({ encodedPolyline: z.string() }).optional(),
      legs: z.array(
        z.object({
          duration: z.string(),
          distanceMeters: z.number(),
          polyline: z.object({ encodedPolyline: z.string() }).optional(),
          steps: z.array(
            z.object({
              travelMode: z.string(),
              staticDuration: z.string(),
              distanceMeters: z.number(),
              polyline: z.object({ encodedPolyline: z.string() }).optional(),
              transitDetails: z
                .object({
                  stopDetails: z
                    .object({
                      arrivalStop: z
                        .object({
                          name: z.string(),
                          location: z
                            .object({
                              latLng: z
                                .object({
                                  latitude: z.number(),
                                  longitude: z.number(),
                                })
                                .optional(),
                            })
                            .optional(),
                        })
                        .optional(),
                      departureStop: z
                        .object({
                          name: z.string(),
                          location: z
                            .object({
                              latLng: z
                                .object({
                                  latitude: z.number(),
                                  longitude: z.number(),
                                })
                                .optional(),
                            })
                            .optional(),
                        })
                        .optional(),
                      arrivalTime: z.string().optional(),
                      departureTime: z.string().optional(),
                    })
                    .optional(),
                  transitLine: z
                    .object({
                      name: z.string(),
                      nameShort: z.string(),
                      vehicle: z.object({ type: z.string() }).optional(),
                    })
                    .optional(),
                  stopCount: z.number(),
                  localizedValues: z
                    .object({
                      departureTime: z
                        .object({
                          time: z.object({ text: z.string().optional() }).optional(),
                          timeZone: z.string(),
                        })
                        .optional(),
                      arrivalTime: z
                        .object({
                          time: z.object({ text: z.string().optional() }).optional(),
                          timeZone: z.string(),
                        })
                        .optional(),
                    })
                    .optional(),
                })
                .optional(),
            }),
          ),
        }),
      ),
    }),
  ),
});

const placesNewSearchResponseSchema: z.ZodType<PlacesNewSearchResponse> = z.object({
  places: z
    .array(
      z.object({
        id: z.string().optional(),
        displayName: z.object({ text: z.string().optional() }).optional(),
        formattedAddress: z.string().optional(),
        location: z
          .object({
            latitude: z.number(),
            longitude: z.number(),
          })
          .optional(),
      }),
    )
    .optional(),
});

const placesNewDetailsResponseSchema: z.ZodType<PlacesNewDetailsResponse> = z.object({
  id: z.string().optional(),
  displayName: z.object({ text: z.string().optional() }).optional(),
  formattedAddress: z.string().optional(),
  location: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
    })
    .optional(),
  businessStatus: z.string().optional(),
  movedPlace: z.string().optional(),
  movedPlaceId: z.string().optional(),
});

const geocodingResponseSchema = z.object({
  results: z.array(
    z.object({
      formatted_address: z.string(),
      geometry: z.object({
        location: z.object({ lat: z.number(), lng: z.number() }),
      }),
      address_components: z.array(
        z.object({
          long_name: z.string(),
          short_name: z.string(),
          types: z.array(z.string()),
        }),
      ),
    }),
  ),
  status: z.string(),
});

function getApiKey() {
  return env.GOOGLE_ROUTES_API_KEY || "";
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
  routingPreference: "FEWER_TRANSFERS" | "LESS_WALKING" = "FEWER_TRANSFERS",
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
      routingPreference,
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
    captureExpectedMessage(`Google Routes API error (${res.status})`, {
      area: "routes",
      extra: { body },
    });
    return null;
  }

  try {
    const parsedJson: unknown = JSON.parse(body);
    const parsed = googleRoutesResponseSchema.safeParse(parsedJson);
    if (!parsed.success) {
      captureExpectedMessage("Google Routes API response validation error", {
        area: "routes",
        extra: { issue: parsed.error.issues[0]?.message ?? parsed.error.message },
      });
      return null;
    }
    return parsed.data;
  } catch {
    captureExpectedMessage("Google Routes API returned invalid JSON", {
      area: "routes",
      extra: { body },
    });
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
    captureExpectedMessage("Places (New) search/details failed, falling back to Geocoding", {
      area: "places",
      extra: { error: err, query },
    });
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
    captureExpectedMessage(`Places Text Search (New) error (${searchRes.status})`, {
      area: "places",
      extra: { body: searchBody, query },
    });
    return [];
  }

  const searchRaw: unknown = JSON.parse(searchBody);
  const parsedSearch = placesNewSearchResponseSchema.safeParse(searchRaw);
  if (!parsedSearch.success) {
    captureExpectedMessage("Places Text Search (New) validation error", {
      area: "places",
      extra: { issue: parsedSearch.error.issues[0]?.message ?? parsedSearch.error.message, query },
    });
    return [];
  }
  const searchData = parsedSearch.data;
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
    captureExpectedMessage(`Place Details (New) error (${res.status})`, {
      area: "places",
      extra: { body, placeId },
    });
    return null;
  }

  const detailsRaw: unknown = JSON.parse(body);
  const parsedDetails = placesNewDetailsResponseSchema.safeParse(detailsRaw);
  if (!parsedDetails.success) {
    captureExpectedMessage("Place Details (New) validation error", {
      area: "places",
      extra: { issue: parsedDetails.error.issues[0]?.message ?? parsedDetails.error.message, placeId },
    });
    return null;
  }
  const data = parsedDetails.data;
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
    captureExpectedMessage(`Google Geocoding error (${res.status})`, {
      area: "places",
      extra: { body, query },
    });
    return [];
  }

  const geocodeRaw: unknown = JSON.parse(body);
  const parsedGeocode = geocodingResponseSchema.safeParse(geocodeRaw);
  if (!parsedGeocode.success) {
    captureExpectedMessage("Google Geocoding response validation error", {
      area: "places",
      extra: { issue: parsedGeocode.error.issues[0]?.message ?? parsedGeocode.error.message, query },
    });
    return [];
  }
  const data = parsedGeocode.data;

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    captureExpectedMessage(`Google Geocoding status: ${data.status}`, {
      area: "places",
      extra: { query },
    });
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
