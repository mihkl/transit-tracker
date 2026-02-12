/**
 * Client-side geo utilities for bearing computation from route shapes.
 * Shape arrays use format: [lat, lng, distTraveled]
 */

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function computeBearing(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLon = toRad(lng2 - lng1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const b = Math.atan2(y, x);
  return (toDeg(b) + 360) % 360;
}

/**
 * Given a shape (array of [lat, lng, distTraveled]) and a distance along that shape,
 * compute the bearing of the segment at that distance.
 * Uses binary search to find the bracketing segment.
 */
export function getBearingFromShape(
  shape: number[][],
  dist: number
): number | null {
  if (!shape || shape.length < 2) return null;

  // Binary search for the segment bracketing dist
  let lo = 0;
  let hi = shape.length - 1;

  // Clamp to shape bounds
  if (dist <= shape[0][2]) {
    return computeBearing(shape[0][0], shape[0][1], shape[1][0], shape[1][1]);
  }
  if (dist >= shape[hi][2]) {
    return computeBearing(
      shape[hi - 1][0],
      shape[hi - 1][1],
      shape[hi][0],
      shape[hi][1]
    );
  }

  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (shape[mid][2] <= dist) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return computeBearing(
    shape[lo][0],
    shape[lo][1],
    shape[hi][0],
    shape[hi][1]
  );
}

/**
 * Interpolate a position along the shape at the given distance.
 * Returns [lat, lng].
 */
export function interpolatePosition(
  shape: number[][],
  dist: number
): [number, number] | null {
  if (!shape || shape.length < 2) return null;

  if (dist <= shape[0][2]) return [shape[0][0], shape[0][1]];
  if (dist >= shape[shape.length - 1][2]) {
    const last = shape[shape.length - 1];
    return [last[0], last[1]];
  }

  let lo = 0;
  let hi = shape.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (shape[mid][2] <= dist) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const segDist = shape[hi][2] - shape[lo][2];
  const t = segDist > 0 ? (dist - shape[lo][2]) / segDist : 0;

  return [
    shape[lo][0] + t * (shape[hi][0] - shape[lo][0]),
    shape[lo][1] + t * (shape[hi][1] - shape[lo][1]),
  ];
}
