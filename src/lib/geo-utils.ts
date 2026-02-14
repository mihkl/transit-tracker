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
  lng2: number,
): number {
  const dLon = toRad(lng2 - lng1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const b = Math.atan2(y, x);
  return (toDeg(b) + 360) % 360;
}

export function getBearingFromShape(
  shape: number[][],
  dist: number,
): number | null {
  if (!shape || shape.length < 2) return null;

  let lo = 0;
  let hi = shape.length - 1;

  if (dist <= shape[0][2]) {
    return computeBearing(shape[0][0], shape[0][1], shape[1][0], shape[1][1]);
  }
  if (dist >= shape[hi][2]) {
    return computeBearing(
      shape[hi - 1][0],
      shape[hi - 1][1],
      shape[hi][0],
      shape[hi][1],
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

  return computeBearing(shape[lo][0], shape[lo][1], shape[hi][0], shape[hi][1]);
}

export function interpolatePosition(
  shape: number[][],
  dist: number,
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
