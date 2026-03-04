import * as fs from "fs";
import * as path from "path";
import { env } from "@/lib/env";
import type { GtfsRoute, GtfsStop, GtfsShapePoint, RoutePattern } from "@/lib/types";

function readJson<T>(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

export function loadGtfs() {
  const dir = env.GTFS_PREPROCESSED_DIR || path.join(process.cwd(), "public", "gtfs-preprocessed");
  console.log(`Loading preprocessed GTFS from ${path.resolve(dir)}...`);

  const routesArr = readJson<GtfsRoute[]>(path.join(dir, "routes.json"));
  const stopsArr = readJson<GtfsStop[]>(path.join(dir, "stops.json"));
  const patternsArr = readJson<RoutePattern[]>(path.join(dir, "patterns.json"));
  const shapesObj = readJson<
    Record<string, { latitude: number; longitude: number; distTraveled: number }[]>
  >(path.join(dir, "shapes.json"));
  const gpsMapObj = readJson<Record<string, string>>(path.join(dir, "gpsMap.json"));

  const routes = new Map<string, GtfsRoute>(routesArr.map((r) => [r.routeId, r]));
  const stops = new Map<string, GtfsStop>(stopsArr.map((s) => [s.stopId, s]));

  const shapesByShapeId = new Map<string, GtfsShapePoint[]>();
  for (const [shapeId, pts] of Object.entries(shapesObj)) {
    shapesByShapeId.set(
      shapeId,
      pts.map((p, i) => ({
        shapeId,
        latitude: p.latitude,
        longitude: p.longitude,
        sequence: i,
        distTraveled: p.distTraveled,
      })),
    );
  }

  const patterns = new Map<string, RoutePattern>();
  for (const p of patternsArr) {
    patterns.set(`${p.routeId}_${p.directionId}`, p);
  }

  const gpsToRouteMap = new Map<string, string>(Object.entries(gpsMapObj));

  console.log(`  ${routes.size} routes`);
  console.log(`  ${stops.size} stops`);
  console.log(`  ${patterns.size} patterns`);
  console.log(`  ${shapesByShapeId.size} shape groups`);

  return { routes, stops, shapesByShapeId, patterns, gpsToRouteMap };
}
