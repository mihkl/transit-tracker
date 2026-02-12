import { NextRequest, NextResponse } from "next/server";
import { transitState } from "@/lib/server/transit-state";
import {
  isConfigured,
  computeRoutes,
  decodePolyline,
} from "@/lib/server/google-routes";
import { matchTransitLeg } from "@/lib/server/delay-matcher";
import type {
  RoutePlanRequest,
  RoutePlanResponse,
  PlannedRoute,
  RouteLeg,
} from "@/lib/types";

export const dynamic = "force-dynamic";

function parseDurationSeconds(duration?: string): number {
  if (!duration) return 0;
  const match = duration.match(/(\d+)s/);
  return match ? parseInt(match[1], 10) : 0;
}

export async function POST(request: NextRequest) {
  await transitState.initialize();

  try {
    if (!isConfigured()) {
      return NextResponse.json(
        { error: "Google Routes API key is not configured." },
        { status: 400 }
      );
    }

    const req: RoutePlanRequest = await request.json();

    const googleResponse = await computeRoutes(
      req.originLat,
      req.originLng,
      req.destinationLat,
      req.destinationLng,
      req.departureTime,
      req.arrivalTime
    );

    if (!googleResponse || googleResponse.routes.length === 0) {
      return NextResponse.json({ routes: [] } as RoutePlanResponse);
    }

    const response: RoutePlanResponse = { routes: [] };

    const googleRoutes = googleResponse.routes.slice(0, 3);

    for (const gRoute of googleRoutes) {
      const route: PlannedRoute = {
        duration: gRoute.duration,
        distanceMeters: String(gRoute.distanceMeters),
        legs: [],
        overviewPolyline: [],
      };

      if (gRoute.polyline?.encodedPolyline) {
        route.overviewPolyline = decodePolyline(
          gRoute.polyline.encodedPolyline
        );
      }

      for (const gLeg of gRoute.legs) {
        for (const step of gLeg.steps) {
          const leg: RouteLeg = {
            mode: "WALK",
            duration: step.staticDuration,
            distanceMeters: String(step.distanceMeters),
            polyline: [],
          };

          if (step.polyline?.encodedPolyline) {
            leg.polyline = decodePolyline(step.polyline.encodedPolyline);
          }

          if (step.travelMode === "TRANSIT" && step.transitDetails) {
            const td = step.transitDetails;
            const vehicleType = td.transitLine?.vehicle?.type ?? "BUS";
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

            const depLat =
              td.stopDetails?.departureStop?.location?.latLng?.latitude;
            const depLng =
              td.stopDetails?.departureStop?.location?.latLng?.longitude;
            const arrLat =
              td.stopDetails?.arrivalStop?.location?.latLng?.latitude;
            const arrLng =
              td.stopDetails?.arrivalStop?.location?.latLng?.longitude;

            leg.departureStopLat = depLat;
            leg.departureStopLng = depLng;
            leg.arrivalStopLat = arrLat;
            leg.arrivalStopLng = arrLng;

            leg.delay = (await matchTransitLeg(
              leg.lineNumber,
              vehicleType,
              leg.departureStop,
              depLat,
              depLng,
              leg.scheduledDeparture,
              leg.arrivalStop,
              arrLat,
              arrLng
            )) ?? undefined;
          } else {
            leg.mode = "WALK";
            if (
              step.distanceMeters < 50 ||
              step.staticDuration === "0s" ||
              !step.staticDuration
            )
              continue;
          }

          route.legs.push(leg);
        }
      }

      // Merge consecutive WALK legs
      const merged: RouteLeg[] = [];
      for (const leg of route.legs) {
        if (
          leg.mode === "WALK" &&
          merged.length > 0 &&
          merged[merged.length - 1].mode === "WALK"
        ) {
          const prev = merged[merged.length - 1];
          const prevSec = parseDurationSeconds(prev.duration);
          const curSec = parseDurationSeconds(leg.duration);
          prev.duration = `${prevSec + curSec}s`;
          const prevDist = parseInt(prev.distanceMeters, 10) || 0;
          const curDist = parseInt(leg.distanceMeters, 10) || 0;
          prev.distanceMeters = String(prevDist + curDist);
          if (leg.polyline.length > 0) {
            prev.polyline = [...prev.polyline, ...leg.polyline];
          }
        } else {
          merged.push(leg);
        }
      }
      route.legs = merged;

      response.routes.push(route);
    }

    return NextResponse.json(response);
  } catch (err) {
    console.error("Route plan error:", err);
    return NextResponse.json(
      { error: `Route planning failed: ${err instanceof Error ? err.message : err}` },
      { status: 500 }
    );
  }
}
