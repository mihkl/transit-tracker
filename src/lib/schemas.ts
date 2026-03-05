import { z } from "zod";
import {
  DELAY_STATUSES,
  LINE_TYPES,
  TRANSIT_MODES,
  TRANSPORT_TYPES,
  TYPE_FILTERS,
} from "@/lib/domain";

export const transportTypeSchema = z.enum(TRANSPORT_TYPES);
export const lineTypeSchema = z.enum(LINE_TYPES);
export const typeFilterSchema = z.enum(TYPE_FILTERS);
export const transitModeSchema = z.enum(TRANSIT_MODES);
export const delayStatusSchema = z.enum(DELAY_STATUSES);

const latLngPairSchema = z.tuple([z.number(), z.number()]);

export const delayInfoSchema = z.object({
  vehicleId: z.string().optional(),
  estimatedDelaySeconds: z.number(),
  status: delayStatusSchema,
  stopsAway: z.number().optional(),
});

export const routeLegSchema = z.object({
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

export const plannedRouteSchema = z.object({
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

export const placesQuerySchema = z.string().trim().min(2).max(120);

export const stopIdSchema = z.string().trim().min(1).max(64);

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

export const nextStopSchema = z.object({
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

export type VehicleStreamEvent = z.infer<typeof vehicleStreamEventSchema>;
