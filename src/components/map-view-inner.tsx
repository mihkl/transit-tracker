"use client";

import { useMemo, useCallback, useRef, useState, useEffect, useSyncExternalStore } from "react";
import Map, {
  Marker,
  Source,
  Layer,
  Popup,
  type MapRef,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { LngLatBoundsLike } from "maplibre-gl";
import type { VehicleDto, RoutePlanResponse, StopDeparture } from "@/lib/types";
import {
  TALLINN_CENTER,
  DEFAULT_ZOOM,
  TYPE_COLORS,
  LEG_COLORS,
} from "@/lib/constants";
import { formatEta, formatDistance } from "@/lib/format-utils";
import { Badge } from "@/components/ui/badge";
import { BottomSheet } from "@/components/bottom-sheet";
import type { MapLayerMouseEvent } from "maplibre-gl";
import type { StopDto } from "@/app/api/all-stops/route";

const INITIAL_VIEW_STATE = {
  longitude: TALLINN_CENTER[1],
  latitude: TALLINN_CENTER[0],
  zoom: DEFAULT_ZOOM,
};

const svgCache: Record<string, string> = {};

function createVehicleIcon(
  color: string,
  bearing: number,
  size: number,
): string {
  const roundedBearing = Math.round(bearing / 5) * 5;
  const cacheKey = `${color}|${roundedBearing}|${size}`;
  const cached = svgCache[cacheKey];
  if (cached) return cached;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
    <g transform="rotate(${roundedBearing} 12 12)">
      <polygon points="12,3 20,21 12,16 4,21" fill="${color}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
    </g>
  </svg>`;

  const result = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  svgCache[cacheKey] = result;
  return result;
}

function createStopIcon(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12">
    <rect x="2" y="2" width="8" height="8" rx="2" fill="#fff" stroke="#666" stroke-width="1.5"/>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function createBoardingStopIcon(lineNumber: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
    <circle cx="10" cy="10" r="8" fill="${color}" stroke="#fff" stroke-width="2"/>
    <text x="10" y="14" text-anchor="middle" fill="#fff" font-size="9" font-weight="bold" font-family="system-ui">${lineNumber}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function createPinIcon(color: string, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="32" viewBox="0 0 24 32">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill="${color}"/>
    <circle cx="12" cy="12" r="5" fill="#fff"/>
    <text x="12" y="15" text-anchor="middle" fill="${color}" font-size="8" font-weight="bold" font-family="system-ui">${label}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const mdQuery = "(min-width: 768px)";
const subscribe = (cb: () => void) => {
  const mql = window.matchMedia(mdQuery);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
};
const getSnapshot = () => window.matchMedia(mdQuery).matches;
const getServerSnapshot = () => true;

function useIsDesktop() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

interface MapViewInnerProps {
  vehicles: VehicleDto[];
  routePlan: RoutePlanResponse | null;
  selectedRouteIndex: number;
  origin: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number } | null;
  pickingPoint: "origin" | "destination" | null;
  onMapClick: (pointType: string, lat: number, lng: number) => void;
  focusedVehicleId: number | null;
  shapes: Record<string, number[][]> | null;
  onVehicleClick: (id: number) => void;
  onDeselectVehicle: () => void;
  selectedStop: StopDto | null;
}

export function MapViewInner({
  vehicles,
  routePlan,
  selectedRouteIndex,
  origin,
  destination,
  pickingPoint,
  onMapClick,
  focusedVehicleId,
  shapes,
  onVehicleClick,
  onDeselectVehicle,
  selectedStop,
}: MapViewInnerProps) {
  const mapRef = useRef<MapRef>(null);
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const [popupVehicle, setPopupVehicle] = useState<VehicleDto | null>(null);
  const [popupStop, setPopupStop] = useState<StopDto | null>(null);
  const [stopDepartures, setStopDepartures] = useState<StopDeparture[]>([]);
  const [departuresLoading, setDeparturesLoading] = useState(false);
  const followingRef = useRef(false);
  const lastFocusedIdRef = useRef<number | null>(null);
  const isDesktop = useIsDesktop();
  const [webglLost, setWebglLost] = useState(false);
  const webglCleanupRef = useRef<(() => void) | null>(null);

  const handleMapLoad = useCallback(() => {
    const canvas = mapRef.current?.getMap()?.getCanvas();
    if (!canvas) return;

    const handleLost = (e: Event) => {
      e.preventDefault();
      setWebglLost(true);
    };
    const handleRestored = () => setWebglLost(false);

    canvas.addEventListener("webglcontextlost", handleLost);
    canvas.addEventListener("webglcontextrestored", handleRestored);
    webglCleanupRef.current = () => {
      canvas.removeEventListener("webglcontextlost", handleLost);
      canvas.removeEventListener("webglcontextrestored", handleRestored);
    };
  }, []);

  useEffect(() => {
    return () => webglCleanupRef.current?.();
  }, []);

  const focusedVehicle = useMemo(() => {
    if (focusedVehicleId == null) return null;
    return vehicles.find((v) => v.id === focusedVehicleId) ?? null;
  }, [vehicles, focusedVehicleId]);

  if (focusedVehicleId !== lastFocusedIdRef.current) {
    lastFocusedIdRef.current = focusedVehicleId;
    if (focusedVehicle) {
      // Only center on vehicle if it has no route shape (fitBounds handles that case)
      const hasRouteShape =
        shapes && focusedVehicle.routeKey && shapes[focusedVehicle.routeKey];
      if (!hasRouteShape) {
        setViewState((prev) => ({
          ...prev,
          longitude: focusedVehicle.longitude,
          latitude: focusedVehicle.latitude,
          zoom: Math.max(prev.zoom, 14),
        }));
      }
      followingRef.current = !hasRouteShape;
      setPopupVehicle(focusedVehicle);
    } else {
      setPopupVehicle(null);
    }
  }

  const handleMapClick = useCallback(
    (e: MapLayerMouseEvent) => {
      if (pickingPoint) {
        onMapClick(pickingPoint, e.lngLat.lat, e.lngLat.lng);
      } else {
        onDeselectVehicle();
        setPopupVehicle(null);
        setPopupStop(null);
      }
    },
    [pickingPoint, onMapClick, onDeselectVehicle],
  );

  const handleVehicleClick = useCallback(
    (v: VehicleDto) => {
      onVehicleClick(v.id);
      setPopupVehicle(v);
      setPopupStop(null);
    },
    [onVehicleClick],
  );

  const handleStopClick = useCallback(async (stop: StopDto) => {
    setPopupStop(stop);
    setPopupVehicle(null);
    setDeparturesLoading(true);
    setStopDepartures([]);

    try {
      const res = await fetch(`/api/departures?stopId=${stop.stopId}`);
      const data = await res.json();
      setStopDepartures(data.slice(0, 5));
    } catch (err) {
      console.error("Failed to fetch departures:", err);
    } finally {
      setDeparturesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedStop) {
      setViewState((prev) => ({
        ...prev,
        longitude: selectedStop.longitude,
        latitude: selectedStop.latitude,
        zoom: Math.max(prev.zoom, 15),
      }));
      handleStopClick(selectedStop);
    } else {
      setPopupStop(null);
      setStopDepartures([]);
    }
  }, [selectedStop, handleStopClick]);

  useEffect(() => {
    if (!popupVehicle) return;
    const updated = vehicles.find((v) => v.id === popupVehicle.id);
    if (updated) {
      setPopupVehicle(updated);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles, popupVehicle?.id]);

  useEffect(() => {
    if (!popupStop) return;

    const intervalId = setInterval(async () => {
      try {
        const res = await fetch(`/api/departures?stopId=${popupStop.stopId}`);
        const data = await res.json();
        setStopDepartures(data.slice(0, 5));
      } catch (err) {
        console.error("Failed to refresh departures:", err);
      }
    }, 5_000);

    return () => clearInterval(intervalId);
  }, [popupStop]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routePlan || !routePlan.routes[selectedRouteIndex]) return;

    const route = routePlan.routes[selectedRouteIndex];
    let minLat = Infinity,
      maxLat = -Infinity,
      minLng = Infinity,
      maxLng = -Infinity;

    for (const leg of route.legs) {
      for (const [lat, lng] of leg.polyline) {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
      }
    }

    if (minLat !== Infinity) {
      map.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ] as LngLatBoundsLike,
        { padding: 60, duration: 500 },
      );
    }
  }, [routePlan, selectedRouteIndex]);

  // Fit map bounds to vehicle route shape when a vehicle is focused
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusedVehicle || !shapes || !focusedVehicle.routeKey) return;
    const shape = shapes[focusedVehicle.routeKey];
    if (!shape || shape.length === 0) return;

    let minLat = Infinity,
      maxLat = -Infinity,
      minLng = Infinity,
      maxLng = -Infinity;

    for (const [lat, lng] of shape) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }

    if (minLat !== Infinity) {
      map.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ] as LngLatBoundsLike,
        { padding: 60, duration: 500 },
      );
    }
  }, [focusedVehicle?.id, focusedVehicle?.routeKey, shapes]);

  const handleMoveEnd = useCallback(() => {
    followingRef.current = false;
  }, []);

  const routeLegsGeoJson = useMemo(() => {
    if (!routePlan || !routePlan.routes[selectedRouteIndex]) return null;
    const route = routePlan.routes[selectedRouteIndex];
    return route.legs.map((leg) => ({
      type: "Feature" as const,
      properties: {
        mode: leg.mode,
        lineNumber: leg.lineNumber,
      },
      geometry: {
        type: "LineString" as const,
        coordinates: leg.polyline.map((p) => [p[1], p[0]]),
      },
    }));
  }, [routePlan, selectedRouteIndex]);

  const vehicleRouteGeoJson = useMemo(() => {
    if (
      !focusedVehicle ||
      !shapes ||
      !focusedVehicle.routeKey ||
      !shapes[focusedVehicle.routeKey]
    )
      return null;
    const shape = shapes[focusedVehicle.routeKey];
    return {
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "LineString" as const,
        coordinates: shape.map((p) => [p[1], p[0]]),
      },
    };
  }, [focusedVehicle, shapes]);

  const boardingStops = useMemo(() => {
    if (!routePlan || !routePlan.routes[selectedRouteIndex]) return [];
    const route = routePlan.routes[selectedRouteIndex];
    const stops: {
      lat: number;
      lng: number;
      name: string;
      lineNumber?: string;
      transportType?: string;
    }[] = [];

    for (const leg of route.legs) {
      if (leg.mode !== "WALK" && leg.departureStopLat && leg.departureStopLng) {
        stops.push({
          lat: leg.departureStopLat,
          lng: leg.departureStopLng,
          name: leg.departureStop || "Boarding stop",
          lineNumber: leg.lineNumber,
          transportType: leg.mode.toLowerCase(),
        });
      }
    }
    return stops;
  }, [routePlan, selectedRouteIndex]);

  const vehiclePopupContent = (vehicle: VehicleDto) => (
    <div className="min-w-[180px] p-1">
      <div className="flex items-center gap-2 mb-2">
        <Badge
          className="text-white"
          style={{
            backgroundColor:
              vehicle.transportType === "bus"
                ? "#2196F3"
                : vehicle.transportType === "tram"
                  ? "#F44336"
                  : vehicle.transportType === "trolleybus"
                    ? "#4CAF50"
                    : "#999",
          }}
        >
          {vehicle.lineNumber}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {vehicle.transportType} #{vehicle.id}
        </span>
      </div>

      {vehicle.destination && (
        <div className="text-sm mb-2">
          <span className="text-muted-foreground">To: </span>
          <span className="font-medium">{vehicle.destination}</span>
        </div>
      )}

      {vehicle.nextStop && (
        <>
          <div className="text-sm font-medium mb-1">
            Next: {vehicle.nextStop.name}
          </div>
          <div className="text-lg font-bold text-primary mb-2">
            {formatEta(vehicle.nextStop.etaSeconds)}
          </div>
        </>
      )}

      <div className="space-y-1 text-xs">
        {vehicle.nextStop && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Distance</span>
            <span>
              {formatDistance(vehicle.nextStop.distanceMeters)}
            </span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Stop</span>
          <span>
            {vehicle.stopIndex + 1} / {vehicle.totalStops}
          </span>
        </div>
      </div>
    </div>
  );

  const stopPopupContent = (stop: StopDto) => (
    <div className="min-w-[200px] p-1">
      <div className="font-semibold text-sm">{stop.stopName}</div>
      {stop.stopDesc && (
        <div className="text-xs text-muted-foreground mb-2">
          {stop.stopDesc}
        </div>
      )}
      {!stop.stopDesc && <div className="mb-2" />}

      {departuresLoading ? (
        <div className="text-xs text-muted-foreground">
          Loading arrivals...
        </div>
      ) : stopDepartures.length === 0 ? (
        <div className="text-xs text-muted-foreground">
          No real-time arrivals available for this stop.
        </div>
      ) : (
        <div className="space-y-1.5">
          {stopDepartures.map((dep, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <Badge
                className="text-white text-[10px] px-1.5 py-0 h-4"
                style={{
                  backgroundColor:
                    dep.transportType === "bus"
                      ? "#2196F3"
                      : dep.transportType === "tram"
                        ? "#F44336"
                        : dep.transportType === "trolleybus"
                          ? "#4CAF50"
                          : "#999",
                }}
              >
                {dep.route}
              </Badge>
              <span className="flex-1 truncate text-muted-foreground">
                {dep.destination}
              </span>
              <span className="font-medium">
                {formatEta(dep.secondsUntilArrival)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const handleBottomSheetClose = useCallback(() => {
    setPopupVehicle(null);
    setPopupStop(null);
    onDeselectVehicle();
  }, [onDeselectVehicle]);

  return (
    <>
      <Map
        ref={mapRef}
        {...viewState}
        onMove={(evt) => {
          setViewState(evt.viewState);
          if (followingRef.current && focusedVehicleId) {
            const v = vehicles.find((v) => v.id === focusedVehicleId);
            if (v) {
              evt.viewState.longitude = v.longitude;
              evt.viewState.latitude = v.latitude;
            }
          }
        }}
        onMoveEnd={handleMoveEnd}
        onClick={handleMapClick}
        onLoad={handleMapLoad}
        style={{ width: "100%", height: "100%" }}
        mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        attributionControl={false}
      >
        {!webglLost && vehicleRouteGeoJson && !routePlan && (
          <Source id="vehicle-route" type="geojson" data={vehicleRouteGeoJson}>
            <Layer
              id="vehicle-route-line"
              type="line"
              paint={{
                "line-color": "#888",
                "line-width": 3,
                "line-opacity": 0.6,
              }}
            />
          </Source>
        )}

        {!webglLost && routeLegsGeoJson && (
          <Source
            id="route-legs"
            type="geojson"
            data={{ type: "FeatureCollection", features: routeLegsGeoJson }}
          >
            <Layer
              id="route-legs-line"
              type="line"
              paint={{
                "line-color": [
                  "match",
                  ["get", "mode"],
                  "WALK",
                  LEG_COLORS.WALK,
                  "BUS",
                  LEG_COLORS.BUS,
                  "TRAM",
                  LEG_COLORS.TRAM,
                  "TROLLEYBUS",
                  LEG_COLORS.TROLLEYBUS,
                  "TRAIN",
                  LEG_COLORS.TRAIN,
                  "#007bff",
                ],
                "line-width": 4,
                "line-opacity": 0.8,
              }}
            />
          </Source>
        )}

        {origin && (
          <Marker longitude={origin.lng} latitude={origin.lat} anchor="bottom">
            <img
              src={createPinIcon("#22c55e", "A")}
              width={24}
              height={32}
              alt="Origin"
            />
          </Marker>
        )}

        {destination && (
          <Marker
            longitude={destination.lng}
            latitude={destination.lat}
            anchor="bottom"
          >
            <img
              src={createPinIcon("#ef4444", "B")}
              width={24}
              height={32}
              alt="Destination"
            />
          </Marker>
        )}

        {boardingStops.map((stop, i) => {
          const color = stop.transportType
            ? TYPE_COLORS[stop.transportType] || TYPE_COLORS.bus
            : "#22c55e";
          return (
            <Marker
              key={`boarding-${i}`}
              longitude={stop.lng}
              latitude={stop.lat}
              anchor="center"
            >
              <img
                src={
                  stop.lineNumber
                    ? createBoardingStopIcon(stop.lineNumber, color)
                    : createStopIcon()
                }
                width={stop.lineNumber ? 20 : 12}
                height={stop.lineNumber ? 20 : 12}
                style={{ cursor: "pointer" }}
                alt={stop.name}
              />
            </Marker>
          );
        })}

        {selectedStop && (
          <Marker
            longitude={selectedStop.longitude}
            latitude={selectedStop.latitude}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              handleStopClick(selectedStop);
            }}
          >
            <img
              src={createStopIcon()}
              width={12}
              height={12}
              style={{ cursor: "pointer" }}
              alt={selectedStop.stopName}
            />
          </Marker>
        )}

        {!webglLost && vehicles.map((v) => {
          const baseColor = TYPE_COLORS[v.transportType] || TYPE_COLORS.unknown;
          const isFocused = focusedVehicleId === v.id;
          const color = isFocused ? "#FF9800" : baseColor;
          const size = isFocused ? 32 : 24;
          const bearing = v.bearing ?? v.heading;
          const icon = createVehicleIcon(color, bearing, size);

          return (
            <Marker
              key={v.id}
              longitude={v.longitude}
              latitude={v.latitude}
              anchor="center"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                handleVehicleClick(v);
              }}
            >
              <img
                src={icon}
                width={size}
                height={size}
                style={{ cursor: "pointer" }}
                alt={`${v.lineNumber}`}
              />
            </Marker>
          );
        })}

        {/* Desktop-only popups */}
        {!webglLost && isDesktop && popupVehicle && (
          <Popup
            longitude={popupVehicle.longitude}
            latitude={popupVehicle.latitude}
            anchor="bottom"
            offset={[0, -16]}
            closeButton={false}
            onClose={() => setPopupVehicle(null)}
            maxWidth="280px"
          >
            {vehiclePopupContent(popupVehicle)}
          </Popup>
        )}

        {!webglLost && isDesktop && popupStop && (
          <Popup
            longitude={popupStop.longitude}
            latitude={popupStop.latitude}
            anchor="bottom"
            offset={[0, -10]}
            closeButton={false}
            onClose={() => setPopupStop(null)}
            maxWidth="280px"
          >
            {stopPopupContent(popupStop)}
          </Popup>
        )}
      </Map>

      {/* Mobile bottom sheet */}
      <BottomSheet
        open={!!(popupVehicle || popupStop)}
        onClose={handleBottomSheetClose}
      >
        {popupVehicle && vehiclePopupContent(popupVehicle)}
        {popupStop && stopPopupContent(popupStop)}
      </BottomSheet>
    </>
  );
}
