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
import type { LngLatBoundsLike } from "maplibre-gl";
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
  VehicleIcon,
  StopIcon,
  BoardingStopIcon,
} from "@/components/map-icons";
import { VehiclePopup } from "@/components/vehicle-popup";
import { StopPopup } from "@/components/stop-popup";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { useTrafficData } from "@/hooks/use-traffic-data";

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

  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    const canvas = map?.getCanvas();
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

        {!webglLost &&
          vehicles.map((v) => {
            const baseColor =
              TYPE_COLORS[v.transportType] || TYPE_COLORS.unknown;
            const isFocused = focusedVehicleId === v.id;
            const color = isFocused ? "#FF9800" : baseColor;
            const size = isFocused ? 32 : 24;
            const bearing = v.bearing ?? v.heading;

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
                <VehicleIcon color={color} bearing={bearing} size={size} />
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
