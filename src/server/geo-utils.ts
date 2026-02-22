import type { ShapePoint } from "@/lib/types";

const EARTH_RADIUS_METERS = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const b = Math.atan2(y, x);
  return (toDeg(b) + 360) % 360;
}

export function projectPointOnSegment(
  pLat: number,
  pLon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): { lat: number; lon: number; fraction: number } {
  const cosLat = Math.cos(toRad((aLat + bLat) / 2));
  const bx = (bLon - aLon) * cosLat;
  const by = bLat - aLat;
  const px = (pLon - aLon) * cosLat;
  const py = pLat - aLat;

  const lenSq = bx * bx + by * by;

  let t: number;
  if (lenSq < 1e-20) {
    t = 0;
  } else {
    t = Math.max(0, Math.min(1, (px * bx + py * by) / lenSq));
  }

  const projLat = aLat + t * (bLat - aLat);
  const projLon = aLon + t * (bLon - aLon);

  return { lat: projLat, lon: projLon, fraction: t };
}

export function findPositionOnRoute(
  lat: number,
  lon: number,
  shapePoints: ShapePoint[],
): { distAlong: number; perpDist: number } {
  if (shapePoints.length === 0) return { distAlong: 0, perpDist: Infinity };

  let bestPerpDist = Infinity;
  let bestDistAlong = 0;

  for (let i = 0; i < shapePoints.length - 1; i++) {
    const a = shapePoints[i];
    const b = shapePoints[i + 1];

    const {
      lat: projLat,
      lon: projLon,
      fraction,
    } = projectPointOnSegment(lat, lon, a.latitude, a.longitude, b.latitude, b.longitude);

    const perpDist = haversineDistance(lat, lon, projLat, projLon);

    if (perpDist < bestPerpDist) {
      bestPerpDist = perpDist;
      const segmentDist = b.distTraveled - a.distTraveled;
      bestDistAlong = a.distTraveled + fraction * segmentDist;
    }
  }

  return { distAlong: bestDistAlong, perpDist: bestPerpDist };
}
