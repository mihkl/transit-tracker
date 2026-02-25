"use server";

import { headers } from "next/headers";
import { transitState } from "@/server/transit-state";
import { isConfigured, computeRoutes, decodePolyline } from "@/server/google-routes";
import { matchTransitLeg } from "@/server/delay-matcher";
import type { RoutePlanRequest, RoutePlanResponse, PlannedRoute, RouteLeg } from "@/lib/types";
import { parseDurationSeconds } from "@/lib/route-time";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizeTransitMode } from "@/lib/domain";
import { routePlanRequestSchema, routePlanResponseSchema } from "@/lib/schemas";

function normalizeVehicleType(type: string) {
  return normalizeTransitMode(type);
}

export async function planRoute(req: RoutePlanRequest): Promise<RoutePlanResponse> {
  const parsedReq = routePlanRequestSchema.parse(req);
  const forwarded = (await headers()).get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",").at(-1)?.trim() ?? "unknown";
  if (!checkRateLimit(`planRoute:${ip}`, 20, 60_000)) {
    throw new Error("Too many requests. Please wait a moment.");
  }

  await transitState.initialize();

  if (!isConfigured()) {
    throw new Error("Google Routes API key is not configured.");
  }

  const googleResponse = await computeRoutes(
    parsedReq.originLat,
    parsedReq.originLng,
    parsedReq.destinationLat,
    parsedReq.destinationLng,
    parsedReq.departureTime,
    parsedReq.arrivalTime,
  );

  if (!googleResponse || !googleResponse.routes?.length) {
    return { routes: [] };
  }

  const response: RoutePlanResponse = { routes: [] };

  for (const gRoute of googleResponse.routes.slice(0, 3)) {
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
            (await matchTransitLeg(
              leg.lineNumber,
              vehicleType,
              leg.departureStop,
              depLat,
              depLng,
              leg.scheduledDeparture,
              leg.arrivalStop,
              arrLat,
              arrLng,
            )) ?? undefined;
        } else {
          leg.mode = "WALK";
          if (step.distanceMeters < 50 || step.staticDuration === "0s" || !step.staticDuration)
            continue;
        }

        route.legs.push(leg);
      }
    }

    // Merge consecutive walk segments
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

  return routePlanResponseSchema.parse(response);
}
