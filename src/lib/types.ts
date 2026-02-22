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
  stopDesc?: string;
  stopArea?: string;
}

export interface GtfsStopTime {
  tripId: string;
  stopId: string;
  stopSequence: number;
  shapeDistTraveled: number;
  departureTime: string;
}

export interface GtfsShapePoint {
  shapeId: string;
  latitude: number;
  longitude: number;
  sequence: number;
  distTraveled: number;
}

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

export interface VehicleDto {
  id: number;
  lineNumber: string;
  transportType: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number;
  bearing: number;
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

export interface RoutePlanRequest {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
  departureTime?: string;
  arrivalTime?: string;
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

export interface ScheduleEntry {
  tripId: string;
  directionId: number;
  departureTime: string;
}

export interface GtfsData {
  routes: Map<string, GtfsRoute>;
  stops: Map<string, GtfsStop>;
  trips: Map<string, GtfsTrip>;
  stopTimesByTrip: Map<string, GtfsStopTime[]>;
  shapesByShapeId: Map<string, GtfsShapePoint[]>;
  patterns: Map<string, RoutePattern>;
  gpsToRouteMap: Map<string, string>;
  scheduleByRouteStop: Map<string, ScheduleEntry[]>;
}

export interface StopArrival {
  transportType: string;
  route: string;
  expectedTime: number;
  scheduleTime: number;
  destination: string;
  secondsUntilArrival: number;
  delaySeconds: number;
  stopSequence?: number;
  totalStops?: number;
  alertsCount?: number;
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

export interface VehicleMatchDebugInfo {
  lineNumber: string;
  mode: string | null;
  departureStopLat: number | null;
  departureStopLng: number | null;
  arrivalStopLat: number | null;
  arrivalStopLng: number | null;
  scheduledDeparture: string | null;
  targetSeconds: number | null;
  correctDirection: number | null;
  routeId: string | null;
  dir0: DirectionPatternInfo | null;
  dir1: DirectionPatternInfo | null;
  candidates: VehicleCandidateInfo[];
  selectedVehicleId: number | null;
  selectionReason: string;
  timestamp: string;
}

export interface DirectionPatternInfo {
  patternKey: string;
  terminal: string;
  depStopDistAlong: number | null;
  arrStopDistAlong: number | null;
  totalLength: number;
}

export interface VehicleCandidateInfo {
  vehicleId: number;
  destination: string;
  latitude: number;
  longitude: number;
  matchedDirection: number | null;
  reason: string;
  forwardDistanceMeters: number;
  etaSeconds: number;
  timeDiffSeconds: number | null;
  isSelected: boolean;
}

export interface StopDto {
  stopId: string;
  stopName: string;
  latitude: number;
  longitude: number;
  stopDesc?: string;
  stopArea?: string;
  lines?: string[];
}
