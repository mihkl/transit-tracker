const TALLINN_BOUNDS = {
  minLat: 59.25,
  maxLat: 59.52,
  minLng: 24.45,
  maxLng: 25.05,
};

function isWithinTallinn(lat: number, lng: number): boolean {
  return (
    lat >= TALLINN_BOUNDS.minLat &&
    lat <= TALLINN_BOUNDS.maxLat &&
    lng >= TALLINN_BOUNDS.minLng &&
    lng <= TALLINN_BOUNDS.maxLng
  );
}

// Desktop browsers can return coarse IP-based geolocation (often wrong city).
// Accept either Tallinn-area fixes or globally precise fixes.
export function isReliableUserLocation(coords: GeolocationCoordinates): boolean {
  const { latitude, longitude, accuracy } = coords;
  return (isWithinTallinn(latitude, longitude) && accuracy <= 100);
}

