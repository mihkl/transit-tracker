import { z } from "zod";
import {
  DELAY_STATUSES,
  LINE_TYPES,
  TRANSIT_MODES,
  TRANSPORT_TYPES,
} from "@/lib/domain";

const transportTypeSchema = z.enum(TRANSPORT_TYPES);
const lineTypeSchema = z.enum(LINE_TYPES);
const transitModeSchema = z.enum(TRANSIT_MODES);
const delayStatusSchema = z.enum(DELAY_STATUSES);

const latLngPairSchema = z.tuple([z.number(), z.number()]);

const delayInfoSchema = z.object({
  vehicleId: z.string().optional(),
  estimatedDelaySeconds: z.number(),
  status: delayStatusSchema,
  stopsAway: z.number().optional(),
});

const routeLegSchema = z.object({
  mode: transitModeSchema,
  lineNumber: z.string().optional(),
  lineName: z.string().optional(),
  departureStop: z.string().optional(),
  arrivalStop: z.string().optional(),
  departureStopLat: z.number().optional(),
  departureStopLng: z.number().optional(),
  arrivalStopLat: z.number().optional(),
  arrivalStopLng: z.number().optional(),
  scheduledDeparture: z.string().optional(),
  scheduledArrival: z.string().optional(),
  numStops: z.number().optional(),
  duration: z.string(),
  distanceMeters: z.string(),
  polyline: z.array(latLngPairSchema),
  delay: delayInfoSchema.optional(),
});

const plannedRouteSchema = z.object({
  duration: z.string(),
  distanceMeters: z.string(),
  legs: z.array(routeLegSchema),
  overviewPolyline: z.array(latLngPairSchema),
});

export const routePlanResponseSchema = z.object({
  routes: z.array(plannedRouteSchema),
});

export const routePlanRequestSchema = z
  .object({
    originLat: z.number(),
    originLng: z.number(),
    destinationLat: z.number(),
    destinationLng: z.number(),
    departureTime: z.string().optional(),
    arrivalTime: z.string().optional(),
    routingPreference: z.enum(["FEWER_TRANSFERS", "LESS_WALKING"]).optional(),
  })
  .refine((v) => !(v.departureTime && v.arrivalTime), {
    message: "Only one of departureTime or arrivalTime can be set",
  });

const multiRouteStopRequestSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  name: z.string().optional(),
  dwellMinutes: z.number().int().min(0).max(24 * 60).optional(),
  departureOverride: z.string().optional(),
});

export const multiRoutePlanRequestSchema = z.object({
  stops: z.array(multiRouteStopRequestSchema).min(3).max(5),
  timeMode: z.enum(["now", "depart", "arrive"]),
  anchorTime: z.string().optional(),
  routingPreference: z.enum(["FEWER_TRANSFERS", "LESS_WALKING"]).optional(),
  liveWindowMinutes: z.number().int().min(1).max(24 * 60).optional(),
}).superRefine((value, ctx) => {
  if (value.timeMode !== "now" && !value.anchorTime) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "anchorTime is required unless timeMode is now",
      path: ["anchorTime"],
    });
  }

  value.stops.forEach((stop, index) => {
    if (index === 0 || index === value.stops.length - 1) {
      if (stop.dwellMinutes != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Only intermediate stops can define dwellMinutes",
          path: ["stops", index, "dwellMinutes"],
        });
      }
      if (stop.departureOverride) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Only intermediate stops can define departureOverride",
          path: ["stops", index, "departureOverride"],
        });
      }
    }
  });
});

const itineraryStopSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  name: z.string(),
});

const multiRouteSegmentSchema = z.object({
  id: z.string(),
  segmentIndex: z.number().int().min(0),
  origin: itineraryStopSchema,
  destination: itineraryStopSchema,
  dwellMinutes: z.number().int().min(0),
  departureOverride: z.string().optional(),
  requestedDepartureTime: z.string().optional(),
  requestedArrivalTime: z.string().optional(),
  route: plannedRouteSchema,
  departureTime: z.string(),
  arrivalTime: z.string(),
  liveEligible: z.boolean(),
  status: z.enum(["live", "scheduled-only"]),
});

const multiRoutePlanFailureSchema = z.object({
  segmentIndex: z.number().int().min(0),
  origin: itineraryStopSchema,
  destination: itineraryStopSchema,
  message: z.string(),
});

const multiRouteItinerarySchema = z.object({
  segments: z.array(multiRouteSegmentSchema),
  totalTravelDuration: z.string(),
  totalDwellMinutes: z.number().int().min(0),
  totalDistanceMeters: z.string(),
  startTime: z.string(),
  endTime: z.string(),
});

export const multiRoutePlanResponseSchema = z.object({
  itinerary: multiRouteItinerarySchema.nullable(),
  failedSegment: multiRoutePlanFailureSchema.optional(),
});

export const placesQuerySchema = z.string().trim().min(2).max(120);

export const stopIdSchema = z.string().trim().min(1).max(64);

export const trafficBoundsSchema = z
  .object({
    minLat: z.number().finite().min(-90).max(90),
    minLng: z.number().finite().min(-180).max(180),
    maxLat: z.number().finite().min(-90).max(90),
    maxLng: z.number().finite().min(-180).max(180),
  })
  .refine((value) => value.minLat < value.maxLat && value.minLng < value.maxLng, {
    message: "Invalid map bounds",
  });

export const legDelayParamsSchema = z.object({
  line: z.string().trim().min(1).max(32).optional(),
  depLat: z.number().optional(),
  depLng: z.number().optional(),
  scheduledDep: z.string().trim().min(1).optional(),
});

export const lineDtoSchema = z.object({
  lineNumber: z.string(),
  type: lineTypeSchema,
  routeId: z.string(),
});

export const stopArrivalSchema = z.object({
  transportType: transportTypeSchema,
  route: z.string(),
  expectedTime: z.number(),
  scheduleTime: z.number(),
  hasRealtime: z.boolean(),
  destination: z.string(),
  secondsUntilArrival: z.number(),
  delaySeconds: z.number(),
  stopSequence: z.number().optional(),
  totalStops: z.number().optional(),
  alertsCount: z.number().optional(),
});

const nextStopSchema = z.object({
  stopId: z.string(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  distanceMeters: z.number(),
});

export const vehicleDtoSchema = z.object({
  id: z.string(),
  lineNumber: z.string(),
  transportType: transportTypeSchema,
  latitude: z.number(),
  longitude: z.number(),
  heading: z.number(),
  bearing: z.number(),
  destination: z.string(),
  directionId: z.number(),
  stopIndex: z.number(),
  totalStops: z.number(),
  nextStop: nextStopSchema.nullable(),
  distanceAlongRoute: z.number(),
  routeKey: z.string().nullable(),
  routeOffsetMeters: z.number().nullable(),
  isOnRoute: z.boolean(),
});

export const vehicleStreamEventSchema = z.object({
  vehicles: z.array(vehicleDtoSchema),
  count: z.number(),
  timestamp: z.string(),
});
