// ── GTFS raw data ──

export interface GtfsRoute {
  routeId: string;
  shortName: string;
  routeType: number;
}

export interface GtfsTrip {
  tripId: string;
  routeId: string;
  directionId: number;
  shapeId: string;
}

export interface GtfsStop {
  stopId: string;
  stopName: string;
  latitude: number;
  longitude: number;
}

export interface GtfsStopTime {
  tripId: string;
  stopId: string;
  stopSequence: number;
  shapeDistTraveled: number;
  departureTime: string; // "HH:MM:SS" from GTFS
}

export interface GtfsShapePoint {
  shapeId: string;
  latitude: number;
  longitude: number;
  sequence: number;
  distTraveled: number;
}

// ── Route patterns ──

export interface RoutePattern {
  routeId: string;
  directionId: number;
  orderedStops: PatternStop[];
  shapePoints: ShapePoint[];
}

export interface PatternStop {
  stopId: string;
  stopName: string;
  latitude: number;
  longitude: number;
  distAlongRoute: number;
}

export interface ShapePoint {
  latitude: number;
  longitude: number;
  distTraveled: number;
}

// ── GPS reading ──

export interface GpsReading {
  transportType: number;
  lineNumber: string;
  longitude: number;
  latitude: number;
  speed: number | null;
  heading: number;
  id: number;
  destination: string;
  timestamp: Date;
}

// ── Vehicle state ──

export interface PositionSnapshot {
  latitude: number;
  longitude: number;
  speed: number | null;
  distanceAlongRoute: number;
  stopIndex: number;
  timestamp: Date;
}

export interface VehicleState {
  id: number;
  transportType: number;
  lineNumber: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number;
  destination: string;
  matchedRouteId: string | null;
  matchedDirectionId: number | null;
  lastStopIndex: number;
  distanceAlongRoute: number;
  lastUpdateTime: Date;
  positionHistory: PositionSnapshot[];
}

export const MAX_HISTORY_SIZE = 60;

// ── DTOs ──

export interface VehicleDto {
  id: number;
  lineNumber: string;
  transportType: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number;
  destination: string;
  directionId: number;
  stopIndex: number;
  totalStops: number;
  nextStop: NextStopDto | null;
  distanceAlongRoute: number;
  speedMs: number;
  routeKey: string | null;
}

export interface NextStopDto {
  name: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  etaSeconds: number;
}

export interface LineDto {
  lineNumber: string;
  type: string;
  routeId: string;
}

// ── Route planning ──

export interface RoutePlanRequest {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
  departureTime?: string;  // ISO 8601
  arrivalTime?: string;    // ISO 8601
}

export interface RoutePlanResponse {
  routes: PlannedRoute[];
}

export interface PlannedRoute {
  duration: string;
  distanceMeters: string;
  legs: RouteLeg[];
  overviewPolyline: number[][];
}

export interface RouteLeg {
  mode: string;
  lineNumber?: string;
  lineName?: string;
  departureStop?: string;
  arrivalStop?: string;
  departureStopLat?: number;
  departureStopLng?: number;
  arrivalStopLat?: number;
  arrivalStopLng?: number;
  scheduledDeparture?: string;
  scheduledArrival?: string;
  numStops?: number;
  duration: string;
  distanceMeters: string;
  polyline: number[][];
  delay?: DelayInfo;
}

export interface DelayInfo {
  vehicleId?: number;
  estimatedDelaySeconds: number;
  status: string;
  stopsAway?: number;
}

export interface PlaceSearchResult {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

// ── Google Routes API response ──

export interface GoogleRoutesResponse {
  routes: GoogleRoute[];
}

export interface GoogleRoute {
  duration: string;
  distanceMeters: number;
  polyline?: GooglePolyline;
  legs: GoogleLeg[];
}

export interface GoogleLeg {
  duration: string;
  distanceMeters: number;
  polyline?: GooglePolyline;
  steps: GoogleStep[];
}

export interface GoogleStep {
  travelMode: string;
  staticDuration: string;
  distanceMeters: number;
  polyline?: GooglePolyline;
  transitDetails?: GoogleTransitDetails;
}

export interface GooglePolyline {
  encodedPolyline: string;
}

export interface GoogleTransitDetails {
  stopDetails?: GoogleStopDetails;
  transitLine?: GoogleTransitLine;
  stopCount: number;
  localizedValues?: GoogleLocalizedValues;
}

export interface GoogleStopDetails {
  arrivalStop?: GoogleStopInfo;
  departureStop?: GoogleStopInfo;
  arrivalTime?: string;
  departureTime?: string;
}

export interface GoogleStopInfo {
  name: string;
  location?: { latLng?: { latitude: number; longitude: number } };
}

export interface GoogleTransitLine {
  name: string;
  nameShort: string;
  vehicle?: { type: string };
}

export interface GoogleLocalizedValues {
  departureTime?: { time?: { text: string }; timeZone: string };
  arrivalTime?: { time?: { text: string }; timeZone: string };
}

export interface NominatimResult {
  lat: string;
  lon: string;
  display_name?: string;
  name?: string;
  address?: {
    house_number?: string;
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    [key: string]: string | undefined;
  };
}

// ── GTFS loader data ──

export interface ScheduleEntry {
  tripId: string;
  directionId: number;
  departureTime: string; // "HH:MM:SS"
}

export interface GtfsData {
  routes: Map<string, GtfsRoute>;
  stops: Map<string, GtfsStop>;
  trips: Map<string, GtfsTrip>;
  stopTimesByTrip: Map<string, GtfsStopTime[]>;
  shapesByShapeId: Map<string, GtfsShapePoint[]>;
  patterns: Map<string, RoutePattern>; // key: "routeId_directionId"
  gpsToRouteMap: Map<string, string>; // key: "transportType_lineNumber"
  scheduleByRouteStop: Map<string, ScheduleEntry[]>; // key: "routeId_stopId" → sorted by time
}

// ── SIRI data ──

export interface StopDeparture {
  transportType: string;
  route: string;
  expectedTime: number;
  scheduleTime: number;
  destination: string;
  secondsUntilArrival: number;
  delaySeconds: number;
}

export interface VehicleStopEta {
  stopId: string;
  stopName: string;
  latitude: number;
  longitude: number;
  expectedArrivalSeconds: number | null;
  scheduledArrivalSeconds: number | null;
  delaySeconds: number | null;
  isPassed: boolean;
}
