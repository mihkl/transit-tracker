import { NextRequest, NextResponse } from "next/server";
import { transitState } from "@/lib/server/transit-state";
import { haversineDistance, findPositionOnRoute } from "@/lib/server/geo-utils";
import type { VehicleDto, ShapePoint, PatternStop } from "@/lib/types";

export const dynamic = "force-dynamic";

// Average transit speed for ETA estimation (~20 km/h including stops)
const AVG_SPEED_MS = 5.5;

/**
 * Find the best matching live vehicle for a planned transit leg.
 *
 * Uses the arrival stop to determine the correct travel direction,
 * and the scheduled departure time to pick the right bus from the
 * "queue" of vehicles on the line.
 */
export async function GET(request: NextRequest) {
  await transitState.initialize();

  const sp = request.nextUrl.searchParams;
  const lineNumber = sp.get("line");
  const depLat = sp.has("depLat") ? parseFloat(sp.get("depLat")!) : null;
  const depLng = sp.has("depLng") ? parseFloat(sp.get("depLng")!) : null;
  const arrLat = sp.has("arrLat") ? parseFloat(sp.get("arrLat")!) : null;
  const arrLng = sp.has("arrLng") ? parseFloat(sp.get("arrLng")!) : null;
  const mode = sp.get("mode");
  const scheduledDep = sp.get("scheduledDep");

  if (!lineNumber || depLat == null || depLng == null) {
    return NextResponse.json(
      { error: "line, depLat, depLng are required" },
      { status: 400 }
    );
  }

  let typeFilter: string | undefined;
  switch (mode?.toUpperCase()) {
    case "BUS":
      typeFilter = "bus";
      break;
    case "TRAM":
      typeFilter = "tram";
      break;
    case "TROLLEYBUS":
      typeFilter = "trolleybus";
      break;
  }

  let vehicles = transitState.getVehicles(lineNumber, typeFilter);
  if (vehicles.length === 0) {
    vehicles = transitState.getVehicles(lineNumber);
  }
  if (vehicles.length === 0) {
    return NextResponse.json({ vehicleId: null });
  }

  // Get both direction patterns, including arrival stop info
  const bothDirs = getBothDirections(lineNumber, typeFilter, depLat, depLng, arrLat, arrLng);

  // Determine the correct travel direction using dep+arr stop positions
  const correctDir = bothDirs ? getCorrectDirection(bothDirs) : null;

  // Parse scheduled departure for time-based matching
  const targetSeconds = scheduledDep ? getTargetSeconds(scheduledDep) : null;

  // Score every vehicle: forward distance + ETA
  const scored = vehicles.map((v) => {
    const fwd = getForwardDistance(v, depLat, depLng, bothDirs, correctDir);
    const etaSeconds = fwd.fwdDist / AVG_SPEED_MS;
    // How far off (in seconds) this vehicle's ETA is from the scheduled departure
    const timeDiffSeconds = targetSeconds !== null
      ? etaSeconds - targetSeconds
      : null;
    return { vehicle: v, ...fwd, etaSeconds, timeDiffSeconds };
  });

  // Log
  console.log(`[find-vehicle] line=${lineNumber} mode=${mode} correctDir=${correctDir} targetSec=${targetSeconds !== null ? Math.round(targetSeconds) : "N/A"}`);
  if (bothDirs) {
    console.log(`  dir0: key=${bothDirs.dir0.patternKey} terminal="${bothDirs.dir0.terminal}" depDist=${fmtDist(bothDirs.dir0.depStopDistAlong)} arrDist=${fmtDist(bothDirs.dir0.arrStopDistAlong)} len=${Math.round(bothDirs.dir0.totalLength)}m`);
    console.log(`  dir1: key=${bothDirs.dir1.patternKey} terminal="${bothDirs.dir1.terminal}" depDist=${fmtDist(bothDirs.dir1.depStopDistAlong)} arrDist=${fmtDist(bothDirs.dir1.arrStopDistAlong)} len=${Math.round(bothDirs.dir1.totalLength)}m`);
  } else {
    console.log(`  no GTFS route found`);
  }
  console.log(`  vehicles (${vehicles.length}):`);
  for (const s of scored) {
    const v = s.vehicle;
    const etaMin = (s.etaSeconds / 60).toFixed(1);
    const diffMin = s.timeDiffSeconds !== null ? (s.timeDiffSeconds / 60).toFixed(1) : "?";
    console.log(`    id=${v.id} dest="${v.destination}" | realDir=${s.matchedDir ?? "?"} ${s.reason} fwd=${Math.round(s.fwdDist)}m eta=${etaMin}min diff=${diffMin}min`);
  }

  // Sort: if we have a scheduled departure, sort by how close ETA matches it.
  // Otherwise fall back to shortest forward distance.
  if (targetSeconds !== null) {
    scored.sort((a, b) => {
      // Absolute time difference from the scheduled departure
      const aDiff = Math.abs(a.timeDiffSeconds!);
      const bDiff = Math.abs(b.timeDiffSeconds!);
      return aDiff - bDiff;
    });
  } else {
    scored.sort((a, b) => a.fwdDist - b.fwdDist);
  }

  const best = scored[0];
  const etaMin = (best.etaSeconds / 60).toFixed(1);
  console.log(`  → picked id=${best.vehicle.id} (eta=${etaMin}min)`);

  return NextResponse.json({ vehicleId: best.vehicle.id });
}

/**
 * Calculate seconds from now until the scheduled departure.
 * Returns negative if the scheduled time is in the past.
 */
function getTargetSeconds(scheduledDep: string): number | null {
  try {
    const depTime = new Date(scheduledDep).getTime();
    if (isNaN(depTime)) return null;
    return (depTime - Date.now()) / 1000;
  } catch {
    return null;
  }
}

function fmtDist(d: number | null): string {
  return d !== null ? Math.round(d) + "m" : "N/A";
}

// ── Types ──

interface DirPattern {
  patternKey: string;
  terminal: string;
  depStopDistAlong: number | null;
  arrStopDistAlong: number | null;
  totalLength: number;
  shapePoints: ShapePoint[];
}

interface BothDirections {
  routeId: string;
  dir0: DirPattern;
  dir1: DirPattern;
}

interface ForwardResult {
  fwdDist: number;
  reason: string;
  matchedDir: number | null;
}

// ── Get both directions ──

function getBothDirections(
  lineNumber: string,
  typeFilter: string | undefined,
  depLat: number,
  depLng: number,
  arrLat: number | null,
  arrLng: number | null
): BothDirections | null {
  const routeId = transitState.getRouteIdForLine(lineNumber, typeFilter);
  if (!routeId) return null;

  const gtfs = transitState.getGtfs();
  if (!gtfs) return null;

  const dirs: DirPattern[] = [];

  for (let dir = 0; dir <= 1; dir++) {
    const key = `${routeId}_${dir}`;
    const pattern = gtfs.patterns.get(key);

    if (!pattern || pattern.orderedStops.length === 0) {
      dirs.push({
        patternKey: key,
        terminal: "",
        depStopDistAlong: null,
        arrStopDistAlong: null,
        totalLength: 0,
        shapePoints: [],
      });
      continue;
    }

    const stops = pattern.orderedStops;
    const terminal = stops[stops.length - 1].stopName;
    const lastShape = pattern.shapePoints[pattern.shapePoints.length - 1];
    const totalLength = lastShape?.distTraveled ?? 0;

    // Find departure stop on this direction
    const dep = findClosestStop(stops, depLat, depLng);
    const depStopDistAlong = (dep.idx >= 0 && dep.dist < 500)
      ? stops[dep.idx].distAlongRoute
      : null;

    // Find arrival stop on this direction
    let arrStopDistAlong: number | null = null;
    if (arrLat != null && arrLng != null) {
      const arr = findClosestStop(stops, arrLat, arrLng);
      if (arr.idx >= 0 && arr.dist < 500) {
        arrStopDistAlong = stops[arr.idx].distAlongRoute;
      }
    }

    dirs.push({
      patternKey: key,
      terminal,
      depStopDistAlong,
      arrStopDistAlong,
      totalLength,
      shapePoints: pattern.shapePoints,
    });
  }

  return {
    routeId,
    dir0: dirs[0],
    dir1: dirs[1],
  };
}

// ── Determine correct travel direction ──

/**
 * The correct direction is the one where the departure stop comes
 * BEFORE the arrival stop along the route (depDist < arrDist).
 * Returns 0, 1, or null if indeterminate.
 */
function getCorrectDirection(bothDirs: BothDirections): number | null {
  const d0 = bothDirs.dir0;
  const d1 = bothDirs.dir1;

  const valid0 = d0.depStopDistAlong !== null && d0.arrStopDistAlong !== null
    && d0.depStopDistAlong < d0.arrStopDistAlong;
  const valid1 = d1.depStopDistAlong !== null && d1.arrStopDistAlong !== null
    && d1.depStopDistAlong < d1.arrStopDistAlong;

  if (valid0 && !valid1) return 0;
  if (valid1 && !valid0) return 1;

  if (valid0 && valid1) {
    const span0 = d0.arrStopDistAlong! - d0.depStopDistAlong!;
    const span1 = d1.arrStopDistAlong! - d1.depStopDistAlong!;
    return span0 <= span1 ? 0 : 1;
  }

  return null;
}

// ── Forward distance ──

/**
 * Calculate forward distance from a vehicle to the departure stop.
 *
 * Uses correctDir to ensure we only count vehicles going the right way
 * as "approaching". Vehicles going the wrong direction must complete
 * their current trip and come back.
 */
function getForwardDistance(
  v: VehicleDto,
  depLat: number,
  depLng: number,
  bothDirs: BothDirections | null,
  correctDir: number | null
): ForwardResult {
  if (!bothDirs) {
    return {
      fwdDist: haversineDistance(v.latitude, v.longitude, depLat, depLng),
      reason: "no-gtfs(haversine)",
      matchedDir: null,
    };
  }

  // Determine vehicle's real direction from its destination
  const realDir = matchDestinationToDir(v.destination, bothDirs);

  if (realDir !== null) {
    const myDir = realDir === 0 ? bothDirs.dir0 : bothDirs.dir1;
    const otherDir = realDir === 0 ? bothDirs.dir1 : bothDirs.dir0;

    // Snap vehicle to its real direction's shape
    const vehicleDist = snapToShape(v, myDir);

    if (vehicleDist !== null) {
      const correctDirPattern = correctDir === 0 ? bothDirs.dir0
        : correctDir === 1 ? bothDirs.dir1
        : null;
      const correctDepDist = correctDirPattern?.depStopDistAlong ?? null;

      if (correctDir !== null && realDir === correctDir) {
        if (correctDepDist !== null) {
          const diff = correctDepDist - vehicleDist;
          if (diff >= 0) {
            return { fwdDist: diff, reason: "approaching", matchedDir: realDir };
          }
          const fwd = (myDir.totalLength - vehicleDist)
            + otherDir.totalLength
            + correctDepDist;
          return { fwdDist: fwd, reason: "passed", matchedDir: realDir };
        }
      } else if (correctDir !== null && realDir !== correctDir) {
        if (correctDepDist !== null) {
          const fwd = (myDir.totalLength - vehicleDist) + correctDepDist;
          return { fwdDist: fwd, reason: "wrong-dir", matchedDir: realDir };
        }
      }

      // Fallback: correctDir unknown
      if (myDir.depStopDistAlong !== null) {
        const diff = myDir.depStopDistAlong - vehicleDist;
        if (diff >= 0) {
          return { fwdDist: diff, reason: "approaching", matchedDir: realDir };
        }
        const fwd = (myDir.totalLength - vehicleDist)
          + otherDir.totalLength
          + myDir.depStopDistAlong;
        return { fwdDist: fwd, reason: "passed", matchedDir: realDir };
      }

      if (otherDir.depStopDistAlong !== null) {
        const fwd = (myDir.totalLength - vehicleDist)
          + otherDir.depStopDistAlong;
        return { fwdDist: fwd, reason: "other-dir-to-stop", matchedDir: realDir };
      }
    }
  }

  return {
    fwdDist: haversineDistance(v.latitude, v.longitude, depLat, depLng),
    reason: "unmatched(haversine)",
    matchedDir: null,
  };
}

/**
 * Snap vehicle to a direction's shape. Returns distance along route.
 */
function snapToShape(v: VehicleDto, dir: DirPattern): number | null {
  if (dir.shapePoints.length === 0) return null;

  const snap = findPositionOnRoute(
    v.latitude, v.longitude, dir.shapePoints
  );

  if (snap.perpDist < 500) {
    return snap.distAlong;
  }

  return null;
}

/**
 * Match a vehicle's destination to a direction's terminal.
 * Returns 0 or 1, or null if no match.
 */
function matchDestinationToDir(
  destination: string,
  bothDirs: BothDirections
): number | null {
  if (!destination) return null;

  const dest = normalize(destination);
  const t0 = normalize(bothDirs.dir0.terminal);
  const t1 = normalize(bothDirs.dir1.terminal);

  const match0 = t0 && fuzzyMatch(dest, t0);
  const match1 = t1 && fuzzyMatch(dest, t1);

  if (match0 && !match1) return 0;
  if (match1 && !match0) return 1;

  return null;
}

function fuzzyMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  const aWords = a.split(/\s+/);
  const bWords = b.split(/\s+/);
  if (aWords[0] === bWords[0] && aWords[0].length >= 3) return true;

  return false;
}

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

function findClosestStop(
  stops: { latitude: number; longitude: number }[],
  lat: number,
  lng: number
): { idx: number; dist: number } {
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < stops.length; i++) {
    const d = haversineDistance(lat, lng, stops[i].latitude, stops[i].longitude);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return { idx: bestIdx, dist: bestDist };
}
