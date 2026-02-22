export function formatEta(seconds: number | null | undefined): string {
  if (seconds == null) return "?";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
}

export function formatSpeed(speed: number | null | undefined): string {
  if (speed == null) return "?";
  return `${Math.round(speed)} km/h`;
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters == null) return "?";
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

export function formatDuration(durationStr: string | undefined): string {
  if (!durationStr) return "?";
  const match = durationStr.match(/(\d+)s/);
  if (!match) return durationStr;
  const totalSec = parseInt(match[1], 10);
  const min = Math.floor(totalSec / 60);
  if (min < 60) return `${min} min`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`;
}

export function formatDelay(seconds: number): string {
  const abs = Math.abs(seconds);
  if (abs < 30) return "On time";
  const min = Math.round(abs / 60);
  if (seconds > 0) return `${min} min late`;
  return `${min} min early`;
}

export function formatCoord(lat: number, lng: number): string {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

export function formatTime(isoString: string | undefined): string {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
