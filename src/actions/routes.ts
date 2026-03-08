"use server";

import { headers } from "next/headers";
import { transitState } from "@/server/transit-state";
import { isConfigured, computeRoutesAsync, decodePolyline } from "@/server/google-routes";
import { matchTransitLegAsync } from "@/server/delay-matcher";
import type { RoutePlanRequest, RoutePlanResponse, PlannedRoute, RouteLeg } from "@/lib/types";
import { parseDurationSeconds } from "@/lib/route-time";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRateLimitContext } from "@/lib/request-client";
import { normalizeTransitMode } from "@/lib/domain";
import { routePlanRequestSchema, routePlanResponseSchema } from "@/lib/schemas";
import { captureExpectedMessage, captureUnexpectedError } from "@/lib/monitoring";

function normalizeVehicleType(type: string) {
  return normalizeTransitMode(type);
}

export interface RoutePlanActionResult {
  data: RoutePlanResponse | null;
  error: string | null;
}

export async function planRouteAsync(
  req: RoutePlanRequest,
  clientId?: string,
): Promise<RoutePlanActionResult> {
  try {
    const parsedReq = routePlanRequestSchema.parse(req);
    const requester = getRateLimitContext(await headers(), clientId);
    const limit = await consumeRateLimit("routes", `planRoute:${requester.requester}`);
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
        extra: { request: parsedReq },
      });
      return { data: null, error: "Too many requests. Please wait a moment." };
    }

    await transitState.initializeAsync();

    if (!isConfigured()) {
      captureExpectedMessage("Google Routes API key is not configured", {
        area: "routes",
        clientId,
      });
      return { data: null, error: "Route planning is unavailable right now." };
    }

    const googleResponse = await computeRoutesAsync(
      parsedReq.originLat,
      parsedReq.originLng,
      parsedReq.destinationLat,
      parsedReq.destinationLng,
      parsedReq.departureTime,
      parsedReq.arrivalTime,
      parsedReq.routingPreference ?? "FEWER_TRANSFERS",
    );

    if (!googleResponse || !googleResponse.routes?.length) {
      return { data: { routes: [] }, error: null };
    }

    const response: RoutePlanResponse = { routes: [] };

    for (const gRoute of googleResponse.routes.slice(0, 5)) {
      const route: PlannedRoute = {
        duration: gRoute.duration,
        distanceMeters: String(gRoute.distanceMeters),
        legs: [],
        overviewPolyline: gRoute.polyline?.encodedPolyline
          ? decodePolyline(gRoute.polyline.encodedPolyline)
          : [],
      };

      for (const gLeg of gRoute.legs) {
        for (const step of gLeg.steps) {
          const leg: RouteLeg = {
            mode: "WALK",
            duration: step.staticDuration,
            distanceMeters: String(step.distanceMeters),
            polyline: step.polyline?.encodedPolyline
              ? decodePolyline(step.polyline.encodedPolyline)
              : [],
          };

          if (step.travelMode === "TRANSIT" && step.transitDetails) {
            const td = step.transitDetails;
            const vehicleType = normalizeVehicleType(td.transitLine?.vehicle?.type ?? "BUS");
            leg.mode = vehicleType;
            leg.lineNumber = td.transitLine?.nameShort || td.transitLine?.name;
            leg.lineName = td.transitLine?.name;
            leg.numStops = td.stopCount;

            if (td.stopDetails) {
              leg.departureStop = td.stopDetails.departureStop?.name;
              leg.arrivalStop = td.stopDetails.arrivalStop?.name;
              leg.scheduledDeparture = td.stopDetails.departureTime;
              leg.scheduledArrival = td.stopDetails.arrivalTime;
            }

            const depLat = td.stopDetails?.departureStop?.location?.latLng?.latitude;
            const depLng = td.stopDetails?.departureStop?.location?.latLng?.longitude;
            const arrLat = td.stopDetails?.arrivalStop?.location?.latLng?.latitude;
            const arrLng = td.stopDetails?.arrivalStop?.location?.latLng?.longitude;

            leg.departureStopLat = depLat;
            leg.departureStopLng = depLng;
            leg.arrivalStopLat = arrLat;
            leg.arrivalStopLng = arrLng;

            leg.delay =
              (await matchTransitLegAsync(
                leg.lineNumber,
                depLat,
                depLng,
                leg.scheduledDeparture,
              )) ?? undefined;
          } else {
            leg.mode = "WALK";
            if (step.distanceMeters < 50 || step.staticDuration === "0s" || !step.staticDuration)
              continue;
          }

          route.legs.push(leg);
        }
      }

      const merged: RouteLeg[] = [];
      for (const leg of route.legs) {
        if (leg.mode === "WALK" && merged.length > 0 && merged[merged.length - 1].mode === "WALK") {
          const prev = merged[merged.length - 1];
          prev.duration = `${parseDurationSeconds(prev.duration) + parseDurationSeconds(leg.duration)}s`;
          prev.distanceMeters = String(
            (parseInt(prev.distanceMeters, 10) || 0) + (parseInt(leg.distanceMeters, 10) || 0),
          );
          if (leg.polyline.length > 0) prev.polyline = [...prev.polyline, ...leg.polyline];
        } else {
          merged.push(leg);
        }
      }
      route.legs = merged;

      response.routes.push(route);
    }

    return { data: routePlanResponseSchema.parse(response), error: null };
  } catch (error) {
    captureUnexpectedError(error, {
      area: "routes",
      clientId,
      extra: { request: req },
    });
    return { data: null, error: "Failed to plan route." };
  }
}
