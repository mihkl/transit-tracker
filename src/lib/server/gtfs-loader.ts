import * as fs from "fs";
import * as readline from "readline";
import * as path from "path";
import type {
  GtfsRoute,
  GtfsStop,
  GtfsTrip,
  GtfsStopTime,
  GtfsShapePoint,
  GtfsData,
  RoutePattern,
  PatternStop,
  ShapePoint,
  ScheduleEntry,
} from "@/lib/types";

async function* readCsv(
  filePath: string
): AsyncGenerator<Record<string, string>> {
  const stream = fs.createReadStream(filePath, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let headers: string[] | null = null;

  for await (const rawLine of rl) {
    let line = rawLine;
    if (!headers) {
      // Handle BOM
      if (line.charCodeAt(0) === 0xfeff) line = line.slice(1);
      headers = line.split(",");
      continue;
    }

    if (!line.trim()) continue;

    const values = line.split(",");
    const record: Record<string, string> = {};
    for (let i = 0; i < headers.length && i < values.length; i++) {
      record[headers[i]] = values[i];
    }
    yield record;
  }
}

export async function loadGtfs(gtfsDir: string): Promise<GtfsData> {
  // Prefer preprocessed JSON (generated at build time) to avoid expensive CSV parsing at runtime.
  const preprocessedDir =
    process.env.GTFS_PREPROCESSED_DIR || path.join(process.cwd(), "public", "gtfs-preprocessed");

  if (fs.existsSync(path.join(preprocessedDir, "routes.json"))) {
    console.log(`Loading preprocessed GTFS from ${path.resolve(preprocessedDir)}...`);

    const routesArr: any[] = JSON.parse(fs.readFileSync(path.join(preprocessedDir, "routes.json"), "utf-8"));
    const stopsArr: any[] = JSON.parse(fs.readFileSync(path.join(preprocessedDir, "stops.json"), "utf-8"));
    const patternsArr: any[] = JSON.parse(fs.readFileSync(path.join(preprocessedDir, "patterns.json"), "utf-8"));
    const shapesObj: Record<string, any[]> = JSON.parse(fs.readFileSync(path.join(preprocessedDir, "shapes.json"), "utf-8"));
    const gpsMapObj: Record<string, string> = JSON.parse(fs.readFileSync(path.join(preprocessedDir, "gpsMap.json"), "utf-8"));
    const scheduleObj: Record<string, any[]> = JSON.parse(fs.readFileSync(path.join(preprocessedDir, "schedule.json"), "utf-8"));

    const routes = new Map<string, GtfsRoute>(routesArr.map((r) => [r.routeId, r]));
    const stops = new Map<string, GtfsStop>(stopsArr.map((s) => [s.stopId, s]));
    const trips = new Map<string, GtfsTrip>();
    const stopTimesByTrip = new Map<string, GtfsStopTime[]>();

    const shapesByShapeId = new Map<string, GtfsShapePoint[]>();
    for (const [shapeId, pts] of Object.entries(shapesObj)) {
      shapesByShapeId.set(
        shapeId,
        pts.map((p, i) => ({ shapeId, latitude: p.latitude, longitude: p.longitude, sequence: i, distTraveled: p.distTraveled }))
      );
    }

    const patterns = new Map<string, RoutePattern>();
    for (const p of patternsArr) {
      const key = `${p.routeId}_${p.directionId}`;
      patterns.set(key, p);
    }

    const gpsToRouteMap = new Map<string, string>(Object.entries(gpsMapObj));

    const scheduleByRouteStop = new Map<string, ScheduleEntry[]>();
    for (const [k, list] of Object.entries(scheduleObj)) {
      scheduleByRouteStop.set(k, list as ScheduleEntry[]);
    }

    console.log(`  ${routes.size} routes`);
    console.log(`  ${stops.size} stops`);
    console.log(`  ${patterns.size} patterns`);
    console.log(`  ${shapesByShapeId.size} shape groups`);

    return {
      routes,
      stops,
      trips,
      stopTimesByTrip,
      shapesByShapeId,
      patterns,
      gpsToRouteMap,
      scheduleByRouteStop,
    };
  }

  const routes = new Map<string, GtfsRoute>();
  const stops = new Map<string, GtfsStop>();
  const trips = new Map<string, GtfsTrip>();
  const stopTimesByTrip = new Map<string, GtfsStopTime[]>();
  const shapesByShapeId = new Map<string, GtfsShapePoint[]>();

  // Load routes
  console.log("Loading GTFS routes...");
  for await (const f of readCsv(path.join(gtfsDir, "routes.txt"))) {
    routes.set(f["route_id"], {
      routeId: f["route_id"],
      shortName: f["route_short_name"],
      routeType: parseInt(f["route_type"], 10),
    });
  }
  console.log(`  ${routes.size} routes`);

  // Load stops
  console.log("Loading GTFS stops...");
  for await (const f of readCsv(path.join(gtfsDir, "stops.txt"))) {
    stops.set(f["stop_id"], {
      stopId: f["stop_id"],
      stopName: f["stop_name"],
      latitude: parseFloat(f["stop_lat"]),
      longitude: parseFloat(f["stop_lon"]),
    });
  }
  console.log(`  ${stops.size} stops`);

  // Load trips
  console.log("Loading GTFS trips...");
  for await (const f of readCsv(path.join(gtfsDir, "trips.txt"))) {
    trips.set(f["trip_id"], {
      tripId: f["trip_id"],
      routeId: f["route_id"],
      directionId: parseInt(f["direction_id"], 10),
      shapeId: f["shape_id"],
    });
  }
  console.log(`  ${trips.size} trips`);

  // Load stop_times
  console.log("Loading GTFS stop_times...");
  let stopTimeCount = 0;
  for await (const f of readCsv(path.join(gtfsDir, "stop_times.txt"))) {
    const st: GtfsStopTime = {
      tripId: f["trip_id"],
      stopId: f["stop_id"],
      stopSequence: parseInt(f["stop_sequence"], 10),
      shapeDistTraveled: parseFloat(f["shape_dist_traveled"]),
      departureTime: f["departure_time"] || "",
    };
    let list = stopTimesByTrip.get(st.tripId);
    if (!list) {
      list = [];
      stopTimesByTrip.set(st.tripId, list);
    }
    list.push(st);
    stopTimeCount++;
  }
  // Sort each trip's stop times by sequence
  for (const list of stopTimesByTrip.values()) {
    list.sort((a, b) => a.stopSequence - b.stopSequence);
  }
  console.log(`  ${stopTimeCount} stop_times`);

  // Load shapes
  console.log("Loading GTFS shapes...");
  let shapePointCount = 0;
  for await (const f of readCsv(path.join(gtfsDir, "shapes.txt"))) {
    const pt: GtfsShapePoint = {
      shapeId: f["shape_id"],
      latitude: parseFloat(f["shape_pt_lat"]),
      longitude: parseFloat(f["shape_pt_lon"]),
      sequence: parseInt(f["shape_pt_sequence"], 10),
      distTraveled: parseFloat(f["shape_dist_traveled"]),
    };
    let list = shapesByShapeId.get(pt.shapeId);
    if (!list) {
      list = [];
      shapesByShapeId.set(pt.shapeId, list);
    }
    list.push(pt);
    shapePointCount++;
  }
  // Sort by sequence
  for (const list of shapesByShapeId.values()) {
    list.sort((a, b) => a.sequence - b.sequence);
  }
  console.log(`  ${shapePointCount} shape points`);

  // Build route patterns
  console.log("Building route patterns...");
  const patterns = buildRoutePatterns(
    trips,
    stopTimesByTrip,
    stops,
    shapesByShapeId
  );
  console.log(`  ${patterns.size} patterns`);

  // Build GPS→route map
  console.log("Building GPS→route map...");
  const gpsToRouteMap = buildGpsToRouteMap(routes);
  console.log(`  ${gpsToRouteMap.size} mappings`);

  // Build schedule index: routeId_stopId → sorted departure entries
  console.log("Building schedule index...");
  const scheduleByRouteStop = buildScheduleIndex(trips, stopTimesByTrip);
  console.log(`  ${scheduleByRouteStop.size} route-stop combinations`);

  return {
    routes,
    stops,
    trips,
    stopTimesByTrip,
    shapesByShapeId,
    patterns,
    gpsToRouteMap,
    scheduleByRouteStop,
  };
}

function buildRoutePatterns(
  trips: Map<string, GtfsTrip>,
  stopTimesByTrip: Map<string, GtfsStopTime[]>,
  stops: Map<string, GtfsStop>,
  shapesByShapeId: Map<string, GtfsShapePoint[]>
): Map<string, RoutePattern> {
  const patterns = new Map<string, RoutePattern>();

  // Group trips by (routeId, directionId)
  const groups = new Map<string, GtfsTrip[]>();
  for (const trip of trips.values()) {
    const key = `${trip.routeId}_${trip.directionId}`;
    let list = groups.get(key);
    if (!list) {
      list = [];
      groups.set(key, list);
    }
    list.push(trip);
  }

  for (const [key, tripGroup] of groups) {
    // Pick the trip with the most stop_times
    let bestTrip: GtfsTrip | null = null;
    let bestCount = 0;

    for (const trip of tripGroup) {
      const stList = stopTimesByTrip.get(trip.tripId);
      if (stList && stList.length > bestCount) {
        bestTrip = trip;
        bestCount = stList.length;
      }
    }

    if (!bestTrip || bestCount === 0) continue;

    const stopTimes = stopTimesByTrip.get(bestTrip.tripId)!;
    const orderedStops: PatternStop[] = [];

    for (const st of stopTimes) {
      const stop = stops.get(st.stopId);
      if (!stop) continue;
      orderedStops.push({
        stopId: st.stopId,
        stopName: stop.stopName,
        latitude: stop.latitude,
        longitude: stop.longitude,
        distAlongRoute: st.shapeDistTraveled,
      });
    }

    const shapePoints: ShapePoint[] = [];
    const rawShape = shapesByShapeId.get(bestTrip.shapeId);
    if (rawShape) {
      for (const sp of rawShape) {
        shapePoints.push({
          latitude: sp.latitude,
          longitude: sp.longitude,
          distTraveled: sp.distTraveled,
        });
      }
    }

    if (orderedStops.length > 0 && shapePoints.length > 0) {
      const lastUnderscore = key.lastIndexOf("_");
      patterns.set(key, {
        routeId: key.substring(0, lastUnderscore),
        directionId: parseInt(key.substring(lastUnderscore + 1), 10),
        orderedStops,
        shapePoints,
      });
    }
  }

  return patterns;
}

function buildScheduleIndex(
  trips: Map<string, GtfsTrip>,
  stopTimesByTrip: Map<string, GtfsStopTime[]>
): Map<string, ScheduleEntry[]> {
  const index = new Map<string, ScheduleEntry[]>();

  for (const [tripId, stopTimes] of stopTimesByTrip) {
    const trip = trips.get(tripId);
    if (!trip) continue;

    for (const st of stopTimes) {
      if (!st.departureTime) continue;
      const key = `${trip.routeId}_${st.stopId}`;
      let list = index.get(key);
      if (!list) {
        list = [];
        index.set(key, list);
      }
      list.push({
        tripId,
        directionId: trip.directionId,
        departureTime: st.departureTime,
      });
    }
  }

  // Sort each list by departure time
  for (const list of index.values()) {
    list.sort((a, b) => a.departureTime.localeCompare(b.departureTime));
  }

  return index;
}

function buildGpsToRouteMap(
  routes: Map<string, GtfsRoute>
): Map<string, string> {
  const map = new Map<string, string>();

  for (const route of routes.values()) {
    const lineNumber = route.shortName;
    if (route.routeId.includes("_bus_")) {
      map.set(`2_${lineNumber}`, route.routeId);
      map.set(`7_${lineNumber}`, route.routeId);
      map.set(`1_${lineNumber}`, route.routeId);
    } else if (route.routeId.includes("_tram_")) {
      map.set(`3_${lineNumber}`, route.routeId);
    } else if (route.routeId.includes("_train_") || route.routeId.includes("_rail_")) {
      map.set(`10_${lineNumber}`, route.routeId);
    }
  }

  return map;
}
