"use client";

import { useMemo, useCallback, useRef, useState, useEffect } from "react";
import Map, {
  Marker,
  Source,
  Layer,
  Popup,
  type MapRef,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { LngLatBoundsLike, Map as MaplibreMap } from "maplibre-gl";
import type {
  VehicleDto,
  RoutePlanResponse,
  StopDeparture,
  StopDto,
} from "@/lib/types";
import {
  TALLINN_CENTER,
  DEFAULT_ZOOM,
  TYPE_COLORS,
  LEG_COLORS,
} from "@/lib/constants";
import { BottomSheet } from "@/components/bottom-sheet";
import type { MapLayerMouseEvent } from "maplibre-gl";
import {
  IncidentIcon,
  PinIcon,
  StopIcon,
  BoardingStopIcon,
  UserLocationDot,
} from "@/components/map-icons";
import { VehiclePopup } from "@/components/vehicle-popup";
import { StopPopup } from "@/components/stop-popup";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { useTrafficData } from "@/hooks/use-traffic-data";
import { Icon } from "@/components/icon";

function fitMapToPoints(map: MapRef, points: number[][]) {
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;

  for (const [lat, lng] of points) {
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
}

async function fetchDepartures(stopId: string): Promise<StopDeparture[]> {
  const res = await fetch(`/api/departures?stopId=${stopId}`);
  const data = await res.json();
  return data.slice(0, 5);
}

function addVehicleArrowImage(map: MaplibreMap) {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Arrow shape matching VehicleIcon SVG (viewBox 0 0 24 24) scaled to 32×32
  const s = size / 24;
  ctx.beginPath();
  ctx.moveTo(12 * s, 3 * s);
  ctx.lineTo(20 * s, 21 * s);
  ctx.lineTo(12 * s, 16 * s);
  ctx.lineTo(4 * s, 21 * s);
  ctx.closePath();
  ctx.lineJoin = "round";
  ctx.fillStyle = "#fff";
  ctx.fill();

  const imageData = ctx.getImageData(0, 0, size, size);
  if (map.hasImage("vehicle-arrow")) map.removeImage("vehicle-arrow");
  map.addImage("vehicle-arrow", imageData, { sdf: true });
}

const INITIAL_VIEW_STATE = {
  longitude: TALLINN_CENTER[1],
  latitude: TALLINN_CENTER[0],
  zoom: DEFAULT_ZOOM,
};

export interface MapViewInnerProps {
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
  showTraffic?: boolean;
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
  showTraffic = false,
}: MapViewInnerProps) {
  const mapRef = useRef<MapRef>(null);
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const [popupVehicle, setPopupVehicle] = useState<VehicleDto | null>(null);
  const [popupStop, setPopupStop] = useState<StopDto | null>(null);
  const [stopDepartures, setStopDepartures] = useState<StopDeparture[]>([]);
  const [departuresLoading, setDeparturesLoading] = useState(false);
  const followingRef = useRef(false);
  const isDesktop = useIsDesktop();
  const [webglLost, setWebglLost] = useState(false);
  const webglCleanupRef = useRef<(() => void) | null>(null);
  const vehiclesRef = useRef(vehicles);
  vehiclesRef.current = vehicles;
  const [mapBounds, setMapBounds] = useState<{
    minLat: number;
    minLng: number;
    maxLat: number;
    maxLng: number;
  } | null>(null);

  const trafficData = useTrafficData(mapBounds, viewState.zoom, {
    enabled: showTraffic,
    minZoom: 11,
    debounceMs: 400,
  });

  // User location
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const hasInitiallyLocated = useRef(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const { latitude, longitude } = coords;
        setUserLocation({ lat: latitude, lng: longitude });

        if (!hasInitiallyLocated.current) {
          hasInitiallyLocated.current = true;
          // Only auto-pan if the map hasn't been moved from the default center
          setViewState((prev) => {
            const atDefault =
              Math.abs(prev.latitude - TALLINN_CENTER[0]) < 0.02 &&
              Math.abs(prev.longitude - TALLINN_CENTER[1]) < 0.02 &&
              prev.zoom === DEFAULT_ZOOM;
            if (!atDefault) return prev;
            return { ...prev, latitude, longitude, zoom: 14 };
          });
        }
      },
      (err) => console.warn("Geolocation error:", err.message),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    const canvas = map?.getCanvas();
    if (!canvas || !map) return;

    addVehicleArrowImage(map);

    const handleLost = (e: Event) => {
      e.preventDefault();
      setWebglLost(true);
    };
    const handleRestored = () => {
      setWebglLost(false);
      const m = mapRef.current?.getMap();
      if (m) addVehicleArrowImage(m);
    };

    canvas.addEventListener("webglcontextlost", handleLost);
    canvas.addEventListener("webglcontextrestored", handleRestored);
    webglCleanupRef.current = () => {
      canvas.removeEventListener("webglcontextlost", handleLost);
      canvas.removeEventListener("webglcontextrestored", handleRestored);
    };

    const bounds = map.getBounds();
    setMapBounds({
      minLat: bounds.getSouth(),
      minLng: bounds.getWest(),
      maxLat: bounds.getNorth(),
      maxLng: bounds.getEast(),
    });
  }, []);

  useEffect(() => {
    return () => webglCleanupRef.current?.();
  }, []);

  const focusedVehicle = useMemo(() => {
    if (focusedVehicleId == null) return null;
    return vehicles.find((v) => v.id === focusedVehicleId) ?? null;
  }, [vehicles, focusedVehicleId]);

  useEffect(() => {
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
    // Only trigger when the focused vehicle *identity* changes, not on every position update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedVehicleId]);

  const handleMapClick = useCallback(
    (e: MapLayerMouseEvent) => {
      if (pickingPoint) {
        onMapClick(pickingPoint, e.lngLat.lat, e.lngLat.lng);
        return;
      }

      const vehicleFeature = e.features?.find(
        (f) => f.layer?.id === "vehicles",
      );
      if (vehicleFeature) {
        const vehicleId = vehicleFeature.properties?.id as number | undefined;
        const vehicle = vehiclesRef.current.find((v) => v.id === vehicleId);
        if (vehicle) {
          onVehicleClick(vehicle.id);
          setPopupVehicle(vehicle);
          setPopupStop(null);
          return;
        }
      }

      onDeselectVehicle();
      setPopupVehicle(null);
      setPopupStop(null);
    },
    [pickingPoint, onMapClick, onDeselectVehicle, onVehicleClick],
  );

  const handleStopClick = useCallback(async (stop: StopDto) => {
    setPopupStop(stop);
    setPopupVehicle(null);
    setDeparturesLoading(true);
    setStopDepartures([]);

    try {
      setStopDepartures(await fetchDepartures(stop.stopId));
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
        setStopDepartures(await fetchDepartures(popupStop.stopId));
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
    const points = route.legs.flatMap((leg) => leg.polyline);
    fitMapToPoints(map, points);
  }, [routePlan, selectedRouteIndex]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusedVehicle || !shapes || !focusedVehicle.routeKey) return;
    const shape = shapes[focusedVehicle.routeKey];
    if (!shape || shape.length === 0) return;

    fitMapToPoints(map, shape);
  }, [focusedVehicle, shapes]);

  const handleMoveEnd = useCallback(() => {
    followingRef.current = false;

    const map = mapRef.current?.getMap();
    if (map) {
      const bounds = map.getBounds();
      setMapBounds({
        minLat: bounds.getSouth(),
        minLng: bounds.getWest(),
        maxLat: bounds.getNorth(),
        maxLng: bounds.getEast(),
      });
    }
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

  const vehiclesGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: vehicles.map((v) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [v.longitude, v.latitude],
        },
        properties: {
          id: v.id,
          bearing: v.bearing ?? v.heading,
          color: TYPE_COLORS[v.transportType] || TYPE_COLORS.unknown,
          focused: focusedVehicleId === v.id ? 1 : 0,
        },
      })),
    }),
    [vehicles, focusedVehicleId],
  );

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

  const handleBottomSheetClose = useCallback(() => {
    setPopupVehicle(null);
    setPopupStop(null);
    onDeselectVehicle();
  }, [onDeselectVehicle]);

  const handleLocateMe = useCallback(() => {
    if (!userLocation || !mapRef.current) return;
    const currentZoom = mapRef.current.getMap()?.getZoom() ?? DEFAULT_ZOOM;
    mapRef.current.getMap()?.flyTo({
      center: [userLocation.lng, userLocation.lat],
      zoom: Math.max(currentZoom, 15),
      duration: 600,
    });
  }, [userLocation]);

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
        interactiveLayerIds={["vehicles"]}
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

        {/* Traffic flow layer - using TomTom raster tiles */}
        {!webglLost && showTraffic && trafficData.flowTileInfo && (
          <Source
            id="traffic-flow"
            type="raster"
            tiles={[trafficData.flowTileInfo.tileUrlTemplate]}
            tileSize={256}
            attribution={trafficData.flowTileInfo.attribution}
            key="traffic-flow-source"
          >
            <Layer
              id="traffic-flow-tiles"
              type="raster"
              paint={{
                "raster-opacity": 0.8,
                "raster-fade-duration": 0,
              }}
            />
          </Source>
        )}

        {/* Traffic incidents as markers */}
        {showTraffic &&
          trafficData.incidents?.features.map((feature, i) => (
            <Marker
              key={`incident-${feature.properties.id}-${i}`}
              longitude={feature.geometry.coordinates[0]}
              latitude={feature.geometry.coordinates[1]}
              anchor="center"
            >
              <IncidentIcon
                category={feature.properties.iconCategory}
                size={32}
              />
            </Marker>
          ))}

        {origin && (
          <Marker longitude={origin.lng} latitude={origin.lat} anchor="bottom">
            <PinIcon color="#22c55e" label="A" />
          </Marker>
        )}

        {destination && (
          <Marker
            longitude={destination.lng}
            latitude={destination.lat}
            anchor="bottom"
          >
            <PinIcon color="#ef4444" label="B" />
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
              {stop.lineNumber ? (
                <BoardingStopIcon lineNumber={stop.lineNumber} color={color} />
              ) : (
                <StopIcon />
              )}
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
            <StopIcon />
          </Marker>
        )}

        {userLocation && (
          <Marker
            longitude={userLocation.lng}
            latitude={userLocation.lat}
            anchor="center"
          >
            <UserLocationDot />
          </Marker>
        )}

        {!webglLost && (
          <Source id="vehicles" type="geojson" data={vehiclesGeoJson}>
            <Layer
              id="vehicles"
              type="symbol"
              layout={{
                "icon-image": "vehicle-arrow",
                "icon-rotation-alignment": "map",
                "icon-rotate": ["get", "bearing"],
                "icon-allow-overlap": true,
                "icon-ignore-placement": true,
                "icon-size": [
                  "case",
                  ["==", ["get", "focused"], 1],
                  1.0,
                  0.75,
                ],
                "symbol-sort-key": [
                  "case",
                  ["==", ["get", "focused"], 1],
                  1,
                  0,
                ],
              }}
              paint={{
                "icon-color": [
                  "case",
                  ["==", ["get", "focused"], 1],
                  "#FF9800",
                  ["get", "color"],
                ],
                "icon-halo-color": "#fff",
                "icon-halo-width": 1,
              }}
            />
          </Source>
        )}

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
            <VehiclePopup vehicle={popupVehicle} />
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
            <StopPopup
              stop={popupStop}
              departures={stopDepartures}
              loading={departuresLoading}
            />
          </Popup>
        )}
      </Map>

      {userLocation && (
        <button
          onClick={handleLocateMe}
          className="absolute bottom-6 left-3 z-1000 w-11 h-11 rounded-xl bg-white shadow-fab flex items-center justify-center text-foreground/60 hover:text-foreground/80 active:scale-95 transition-all duration-150"
          title="Center on my location"
        >
          <Icon name="crosshair" className="w-5 h-5" />
        </button>
      )}

      {/* Mobile bottom sheet */}
      <BottomSheet
        open={!!(popupVehicle || popupStop)}
        onClose={handleBottomSheetClose}
      >
        {popupVehicle && <VehiclePopup vehicle={popupVehicle} />}
        {popupStop && (
          <StopPopup
            stop={popupStop}
            departures={stopDepartures}
            loading={departuresLoading}
          />
        )}
      </BottomSheet>
    </>
  );
}
