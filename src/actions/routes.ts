"use server";

import { headers } from "next/headers";
import { transitState } from "@/server/transit-state";
import { isConfigured, computeRoutesAsync, decodePolyline } from "@/server/google-routes";
import { matchTransitLegAsync } from "@/server/delay-matcher";
import type {
  ItineraryStop,
  MultiRoutePlanRequest,
  MultiRoutePlanResponse,
  MultiRouteSegment,
  PlannedRoute,
  RouteLeg,
  RoutePlanRequest,
  RoutePlanResponse,
} from "@/lib/types";
import { parseDurationSeconds } from "@/lib/route-time";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRateLimitContext } from "@/lib/request-client";
import { normalizeTransitMode } from "@/lib/domain";
import {
  multiRoutePlanRequestSchema,
  multiRoutePlanResponseSchema,
  routePlanRequestSchema,
  routePlanResponseSchema,
} from "@/lib/schemas";
import { captureExpectedMessage, captureUnexpectedError } from "@/lib/monitoring";

export interface RoutePlanActionResult {
  data: RoutePlanResponse | null;
  error: string | null;
}

export interface MultiRoutePlanActionResult {
  data: MultiRoutePlanResponse | null;
  error: string | null;
}

interface RouteAssemblyOptions {
  includeRealtime?: boolean;
}

async function ensureRoutePlanningAvailableAsync(clientId?: string) {
  await transitState.initializeAsync();

  if (!isConfigured()) {
    captureExpectedMessage("Google Routes API key is not configured", {
      area: "routes",
      clientId,
    });
    return "Route planning is unavailable right now.";
  }

  return null;
}

function isNearTerm(isoTime: string | undefined, liveWindowMinutes: number) {
  if (!isoTime) return false;
  return new Date(isoTime).getTime() - Date.now() <= liveWindowMinutes * 60_000;
}

function buildStop(point: { lat: number; lng: number; name?: string }): ItineraryStop {
  return {
    lat: point.lat,
    lng: point.lng,
    name: point.name?.trim() || `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`,
  };
}

function mergeWalkingLegs(legs: RouteLeg[]) {
  const merged: RouteLeg[] = [];
  for (const leg of legs) {
    if (leg.mode === "WALK" && merged.length > 0 && merged[merged.length - 1].mode === "WALK") {
      const previous = merged[merged.length - 1];
      previous.duration = `${parseDurationSeconds(previous.duration) + parseDurationSeconds(leg.duration)}s`;
      previous.distanceMeters = String(
        (parseInt(previous.distanceMeters, 10) || 0) + (parseInt(leg.distanceMeters, 10) || 0),
      );
      if (leg.polyline.length > 0) previous.polyline = [...previous.polyline, ...leg.polyline];
      continue;
    }
    merged.push(leg);
  }
  return merged;
}

function getFirstTransitDeparture(route: PlannedRoute) {
  for (const leg of route.legs) {
    if (leg.mode !== "WALK" && leg.scheduledDeparture) {
      return leg.scheduledDeparture;
    }
  }
  return null;
}

function getRouteWindow(route: PlannedRoute, fallback: { departureTime?: string; arrivalTime?: string }) {
  let firstTransitDeparture: Date | null = null;
  let lastTransitArrival: Date | null = null;
  let walkBeforeSeconds = 0;
  let walkAfterSeconds = 0;
  let foundTransit = false;

  for (const leg of route.legs) {
    if (leg.mode === "WALK") {
      const seconds = parseDurationSeconds(leg.duration);
      if (!foundTransit) walkBeforeSeconds += seconds;
      else walkAfterSeconds += seconds;
      continue;
    }

    foundTransit = true;
    if (!firstTransitDeparture && leg.scheduledDeparture) {
      firstTransitDeparture = new Date(leg.scheduledDeparture);
    }
    if (leg.scheduledArrival) {
      lastTransitArrival = new Date(leg.scheduledArrival);
    }
  }

  let departureTime = firstTransitDeparture
    ? new Date(firstTransitDeparture.getTime() - walkBeforeSeconds * 1000)
    : fallback.departureTime
      ? new Date(fallback.departureTime)
      : null;

  let arrivalTime = lastTransitArrival
    ? new Date(lastTransitArrival.getTime() + walkAfterSeconds * 1000)
    : fallback.arrivalTime
      ? new Date(fallback.arrivalTime)
      : null;

  if (!departureTime && arrivalTime) {
    departureTime = new Date(arrivalTime.getTime() - parseDurationSeconds(route.duration) * 1000);
  }
  if (!arrivalTime && departureTime) {
    arrivalTime = new Date(departureTime.getTime() + parseDurationSeconds(route.duration) * 1000);
  }

  return {
    departureTime: departureTime?.toISOString() ?? new Date().toISOString(),
    arrivalTime: arrivalTime?.toISOString() ?? new Date().toISOString(),
  };
}

async function buildRoutePlanResponseAsync(
  req: RoutePlanRequest,
  { includeRealtime = true }: RouteAssemblyOptions = {},
) {
  const googleResponse = await computeRoutesAsync(
    req.originLat,
    req.originLng,
    req.destinationLat,
    req.destinationLng,
    req.departureTime,
    req.arrivalTime,
    req.routingPreference ?? "FEWER_TRANSFERS",
  );

  if (!googleResponse || !googleResponse.routes?.length) {
    return { routes: [] } satisfies RoutePlanResponse;
  }

  const response: RoutePlanResponse = { routes: [] };

  for (const googleRoute of googleResponse.routes.slice(0, 5)) {
    const route: PlannedRoute = {
      duration: googleRoute.duration,
      distanceMeters: String(googleRoute.distanceMeters),
      legs: [],
      overviewPolyline: googleRoute.polyline?.encodedPolyline
        ? decodePolyline(googleRoute.polyline.encodedPolyline)
        : [],
    };

    for (const googleLeg of googleRoute.legs) {
      for (const step of googleLeg.steps) {
        const leg: RouteLeg = {
          mode: "WALK",
          duration: step.staticDuration,
          distanceMeters: String(step.distanceMeters),
          polyline: step.polyline?.encodedPolyline
            ? decodePolyline(step.polyline.encodedPolyline)
            : [],
        };

        if (step.travelMode === "TRANSIT" && step.transitDetails) {
          const details = step.transitDetails;
          const vehicleType = normalizeTransitMode(details.transitLine?.vehicle?.type ?? "BUS");
          leg.mode = vehicleType;
          leg.lineNumber = details.transitLine?.nameShort || details.transitLine?.name;
          leg.lineName = details.transitLine?.name;
          leg.numStops = details.stopCount;

          if (details.stopDetails) {
            leg.departureStop = details.stopDetails.departureStop?.name;
            leg.arrivalStop = details.stopDetails.arrivalStop?.name;
            leg.scheduledDeparture = details.stopDetails.departureTime;
            leg.scheduledArrival = details.stopDetails.arrivalTime;
          }

          const departureLat = details.stopDetails?.departureStop?.location?.latLng?.latitude;
          const departureLng = details.stopDetails?.departureStop?.location?.latLng?.longitude;
          const arrivalLat = details.stopDetails?.arrivalStop?.location?.latLng?.latitude;
          const arrivalLng = details.stopDetails?.arrivalStop?.location?.latLng?.longitude;

          leg.departureStopLat = departureLat;
          leg.departureStopLng = departureLng;
          leg.arrivalStopLat = arrivalLat;
          leg.arrivalStopLng = arrivalLng;

          if (includeRealtime) {
            leg.delay =
              (await matchTransitLegAsync(
                leg.lineNumber,
                departureLat,
                departureLng,
                leg.scheduledDeparture,
              )) ?? undefined;
          }
        } else {
          leg.mode = "WALK";
          if (step.distanceMeters < 50 || step.staticDuration === "0s" || !step.staticDuration) {
            continue;
          }
        }

        route.legs.push(leg);
      }
    }

    route.legs = mergeWalkingLegs(route.legs);
    response.routes.push(route);
  }

  return routePlanResponseSchema.parse(response);
}

async function consumeRoutingRateLimitAsync(clientId?: string, operation = "planRoute") {
  const requester = getRateLimitContext(await headers(), clientId);
  const limit = await consumeRateLimit("routes", `${operation}:${requester.requester}`);

  if (!limit.ok) {
    captureExpectedMessage("Route planning rate limit exceeded", {
      area: "routes",
      clientId,
      tags: {
        requester_type: requester.requesterType,
        client_id_provided: requester.clientIdProvided,
        client_id_accepted: requester.clientIdAccepted,
        rate_limit_backend: limit.backend,
        rate_limit_reason: limit.reason,
      },
    });
    return "Too many requests. Please wait a moment.";
  }

  return null;
}

function buildSegmentResult(
  segmentIndex: number,
  origin: ItineraryStop,
  destination: ItineraryStop,
  route: PlannedRoute,
  dwellMinutes: number,
  departureOverride: string | undefined,
  requestedDepartureTime: string | undefined,
  requestedArrivalTime: string | undefined,
  liveWindowMinutes: number,
) {
  const window = getRouteWindow(route, {
    departureTime: requestedDepartureTime,
    arrivalTime: requestedArrivalTime,
  });
  const liveEligible = isNearTerm(
    getFirstTransitDeparture(route) ?? window.departureTime,
    liveWindowMinutes,
  );

  const segment: MultiRouteSegment = {
    id: `segment-${segmentIndex}`,
    segmentIndex,
    origin,
    destination,
    dwellMinutes,
    departureOverride,
    requestedDepartureTime,
    requestedArrivalTime,
    route,
    departureTime: window.departureTime,
    arrivalTime: window.arrivalTime,
    liveEligible,
    status: liveEligible ? "live" : "scheduled-only",
  };

  return { segment, window };
}

function buildItineraryResponse(segments: MultiRouteSegment[]): MultiRoutePlanResponse {
  if (segments.length === 0) {
    return { itinerary: null };
  }

  const totalDwellMinutes = segments
    .slice(0, -1)
    .reduce((sum, segment) => sum + segment.dwellMinutes, 0);
  const totalDistanceMeters = segments.reduce(
    (sum, segment) => sum + (parseInt(segment.route.distanceMeters, 10) || 0),
    0,
  );
  const startTime = segments[0].departureTime;
  const endTime = segments[segments.length - 1].arrivalTime;

  return multiRoutePlanResponseSchema.parse({
    itinerary: {
      segments,
      totalTravelDuration: `${Math.max(
        0,
        Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000),
      )}s`,
      totalDwellMinutes,
      totalDistanceMeters: String(totalDistanceMeters),
      startTime,
      endTime,
    },
  });
}

export async function planRouteAsync(
  req: RoutePlanRequest,
  clientId?: string,
): Promise<RoutePlanActionResult> {
  try {
    const parsedReq = routePlanRequestSchema.parse(req);
    const limitError = await consumeRoutingRateLimitAsync(clientId, "planRoute");
    if (limitError) return { data: null, error: limitError };

    const availabilityError = await ensureRoutePlanningAvailableAsync(clientId);
    if (availabilityError) {
      return { data: null, error: availabilityError };
    }

    const data = await buildRoutePlanResponseAsync(parsedReq);
    return { data, error: null };
  } catch (error) {
    captureUnexpectedError(error, {
      area: "routes",
      clientId,
      extra: { request: req },
    });
    return { data: null, error: "Failed to plan route." };
  }
}

export async function planMultiRouteAsync(
  req: MultiRoutePlanRequest,
  clientId?: string,
): Promise<MultiRoutePlanActionResult> {
  try {
    const parsedReq = multiRoutePlanRequestSchema.parse(req);
    const limitError = await consumeRoutingRateLimitAsync(clientId, "planMultiRoute");
    if (limitError) return { data: null, error: limitError };

    const availabilityError = await ensureRoutePlanningAvailableAsync(clientId);
    if (availabilityError) {
      return { data: null, error: availabilityError };
    }

    const liveWindowMinutes = parsedReq.liveWindowMinutes ?? 90;
    const segments: MultiRouteSegment[] = [];
    const stops = parsedReq.stops.map(buildStop);
    const routingPreference = parsedReq.routingPreference ?? "FEWER_TRANSFERS";

    if (parsedReq.timeMode === "arrive") {
      let requiredArrivalTime =
        parsedReq.anchorTime ?? new Date().toISOString();

      for (let index = stops.length - 2; index >= 0; index -= 1) {
        const originStop = parsedReq.stops[index];
        const destinationStop = parsedReq.stops[index + 1];
        const departureOverride = index > 0 ? originStop.departureOverride : undefined;

        const singleRequest: RoutePlanRequest = {
          originLat: originStop.lat,
          originLng: originStop.lng,
          destinationLat: destinationStop.lat,
          destinationLng: destinationStop.lng,
          routingPreference,
          ...(departureOverride
            ? { departureTime: departureOverride }
            : { arrivalTime: requiredArrivalTime }),
        };

        const routeResponse = await buildRoutePlanResponseAsync(singleRequest, {
          includeRealtime: true,
        });
        const route = routeResponse.routes[0];

        if (!route) {
          return {
            data: multiRoutePlanResponseSchema.parse({
              itinerary: segments.length ? buildItineraryResponse(segments).itinerary : null,
              failedSegment: {
                segmentIndex: index,
                origin: stops[index],
                destination: stops[index + 1],
                message: "No routes found for this segment.",
              },
            }),
            error: null,
          };
        }

        const { segment, window } = buildSegmentResult(
          index,
          stops[index],
          stops[index + 1],
          route,
          index + 1 < parsedReq.stops.length - 1 ? parsedReq.stops[index + 1].dwellMinutes ?? 0 : 0,
          departureOverride,
          departureOverride,
          departureOverride ? undefined : requiredArrivalTime,
          liveWindowMinutes,
        );
        segments.unshift(segment);

        if (index > 0) {
          const stopBeforeCurrent = parsedReq.stops[index];
          requiredArrivalTime = stopBeforeCurrent.departureOverride
            ? window.departureTime
            : new Date(
                new Date(window.departureTime).getTime() - (stopBeforeCurrent.dwellMinutes ?? 0) * 60_000,
              ).toISOString();
        }
      }

      return { data: buildItineraryResponse(segments), error: null };
    }

    let nextDepartureTime =
      parsedReq.timeMode === "now"
        ? new Date().toISOString()
        : parsedReq.anchorTime ?? new Date().toISOString();

    for (let index = 0; index < stops.length - 1; index += 1) {
      const originStop = parsedReq.stops[index];
      const destinationStop = parsedReq.stops[index + 1];
      const departureOverride = index > 0 ? originStop.departureOverride : undefined;
      const requestedDepartureTime = departureOverride || nextDepartureTime;

      const singleRequest: RoutePlanRequest = {
        originLat: originStop.lat,
        originLng: originStop.lng,
        destinationLat: destinationStop.lat,
        destinationLng: destinationStop.lng,
        departureTime: requestedDepartureTime,
        routingPreference,
      };

      const routeResponse = await buildRoutePlanResponseAsync(singleRequest, {
        includeRealtime: true,
      });
      const route = routeResponse.routes[0];

      if (!route) {
        return {
          data: multiRoutePlanResponseSchema.parse({
            itinerary: segments.length ? buildItineraryResponse(segments).itinerary : null,
            failedSegment: {
              segmentIndex: index,
              origin: stops[index],
              destination: stops[index + 1],
              message: "No routes found for this segment.",
            },
          }),
          error: null,
        };
      }

      const dwellMinutes = index + 1 < parsedReq.stops.length - 1
        ? parsedReq.stops[index + 1].dwellMinutes ?? 0
        : 0;
      const { segment, window } = buildSegmentResult(
        index,
        stops[index],
        stops[index + 1],
        route,
        dwellMinutes,
        departureOverride,
        requestedDepartureTime,
        undefined,
        liveWindowMinutes,
      );
      segments.push(segment);

      nextDepartureTime = parsedReq.stops[index + 1].departureOverride
        ? window.arrivalTime
        : new Date(new Date(window.arrivalTime).getTime() + dwellMinutes * 60_000).toISOString();
    }

    return { data: buildItineraryResponse(segments), error: null };
  } catch (error) {
    captureUnexpectedError(error, {
      area: "routes",
      clientId,
      extra: { request: req },
    });
    return { data: null, error: "Failed to plan route." };
  }
}
