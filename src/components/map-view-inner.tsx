"use client";

import { useMemo, useCallback, useRef, useState, useEffect } from "react";
import Map, { Marker, Source, Layer, Popup, type MapRef } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { VehicleDto, RoutePlanResponse, StopArrival, StopDto } from "@/lib/types";
import { TALLINN_CENTER, DEFAULT_ZOOM, TYPE_COLORS } from "@/lib/constants";
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
import { useUserLocation } from "@/hooks/use-user-location";
import { useStops } from "@/hooks/use-stops";
import { MAP_LAYER_IDS } from "@/lib/domain";
import {
  addVehicleArrowImage,
  buildBoardingStops,
  buildRouteLegFeatures,
  buildStopsFeatureCollection,
  buildVehicleRouteFeature,
  buildVehiclesFeatureCollection,
  fitMapToPoints,
  ROUTE_LEG_COLOR_EXPRESSION,
} from "@/components/map/map-view-helpers";

import { getStopArrivals } from "@/actions";

async function fetchArrivals(stopId: string): Promise<StopArrival[]> {
  return getStopArrivals(stopId);
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
  routeFitRequest?: number;
  origin: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number } | null;
  pickingPoint: "origin" | "destination" | null;
  onMapClick: (pointType: "origin" | "destination", lat: number, lng: number) => void;
  focusedVehicleId: string | null;
  shapes: Record<string, number[][]> | null;
  onVehicleClick: (id: string) => void;
  onDeselectVehicle: () => void;
  selectedStop: StopDto | null;
  showTraffic?: boolean;
  showStops?: boolean;
}

export function MapViewInner({
  vehicles,
  routePlan,
  selectedRouteIndex,
  routeFitRequest = 0,
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
  showStops = false,
}: MapViewInnerProps) {
  const mapRef = useRef<MapRef>(null);
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const [popupVehicle, setPopupVehicle] = useState<VehicleDto | null>(null);
  const [popupStop, setPopupStop] = useState<StopDto | null>(null);
  const [stopArrivals, setStopArrivals] = useState<StopArrival[]>([]);
  const [arrivalsLoading, setArrivalsLoading] = useState(false);
  const followingRef = useRef(false);
  const [hoveringInteractive, setHoveringInteractive] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const isDesktop = useIsDesktop();
  const [webglLost, setWebglLost] = useState(false);
  const webglCleanupRef = useRef<(() => void) | null>(null);
  const vehiclesRef = useRef(vehicles);
  vehiclesRef.current = vehicles;
  const popupVehicleKeyRef = useRef<string>("");
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
  const { stops: allStops } = useStops();

  const userLocation = useUserLocation();

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
  const focusedVehicleRef = useRef(focusedVehicle);
  focusedVehicleRef.current = focusedVehicle;

  useEffect(() => {
    if (focusedVehicle) {
      // Only center on vehicle if it has no route shape (fitBounds handles that case)
      const hasRouteShape = shapes && focusedVehicle.routeKey && shapes[focusedVehicle.routeKey];
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

  const handleStopClick = useCallback(async (stop: StopDto) => {
    setPopupStop(stop);
    setPopupVehicle(null);
    setArrivalsLoading(true);
    setStopArrivals([]);

    try {
      setStopArrivals(await fetchArrivals(stop.stopId));
    } catch (err) {
      console.error("Failed to fetch departures:", err);
    } finally {
      setArrivalsLoading(false);
    }
  }, []);

  const handleMapClick = useCallback(
    (e: MapLayerMouseEvent) => {
      if (pickingPoint) {
        onMapClick(pickingPoint, e.lngLat.lat, e.lngLat.lng);
        return;
      }

      const vehicleFeature = e.features?.find(
        (f) => f.layer?.id === MAP_LAYER_IDS.VEHICLES,
      );
      if (vehicleFeature) {
        const rawVehicleId = vehicleFeature.properties?.id;
        const vehicleId = rawVehicleId == null ? undefined : String(rawVehicleId);
        const vehicle = vehiclesRef.current.find((v) => v.id === vehicleId);
        if (vehicle) {
          onVehicleClick(vehicle.id);
          setPopupVehicle(vehicle);
          setPopupStop(null);
          return;
        }
      }

      const stopFeature = e.features?.find(
        (f) =>
          f.layer?.id === MAP_LAYER_IDS.ALL_STOPS ||
          f.layer?.id === MAP_LAYER_IDS.ALL_STOPS_HIT,
      );
      if (stopFeature) {
        const stopId = String(stopFeature.properties?.stopId ?? "");
        const stop = allStops.find((s) => s.stopId === stopId);
        if (stop) {
          void handleStopClick(stop);
          return;
        }
      }

      onDeselectVehicle();
      setPopupVehicle(null);
      setPopupStop(null);
    },
    [pickingPoint, onMapClick, onDeselectVehicle, onVehicleClick, allStops, handleStopClick],
  );

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
      setStopArrivals([]);
    }
  }, [selectedStop, handleStopClick]);

  useEffect(() => {
    if (!popupVehicle) return;
    const updated = vehicles.find((v) => v.id === popupVehicle.id);
    if (!updated) return;
    // Only update popup when API data changes, not on every animation frame.
    // Exclude lat/lng/bearing because those are animated and change at 60fps.
    const key = `${popupVehicle.id}:${updated.stopIndex}:${updated.distanceAlongRoute}:${updated.speedMs}:${updated.nextStop?.name ?? ""}:${updated.nextStop?.etaSeconds ?? ""}`;
    if (key === popupVehicleKeyRef.current) return;
    popupVehicleKeyRef.current = key;
    setPopupVehicle(updated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles, popupVehicle?.id]);

  useEffect(() => {
    if (!popupStop) return;

    const refresh = async () => {
      try {
        setStopArrivals(await fetchArrivals(popupStop.stopId));
      } catch (err) {
        console.error("Failed to refresh departures:", err);
      }
    };

    const intervalId = setInterval(refresh, 5_000);

    const handleVisibility = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [popupStop]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routePlan || !routePlan.routes[selectedRouteIndex]) return;

    const route = routePlan.routes[selectedRouteIndex];
    const points = route.legs.flatMap((leg) => leg.polyline);
    fitMapToPoints(map, points, { isDesktop, reserveBottomSpace: !isDesktop });
  }, [routePlan, selectedRouteIndex, routeFitRequest, isDesktop]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusedVehicle || !shapes || !focusedVehicle.routeKey) return;
    const shape = shapes[focusedVehicle.routeKey];
    if (!shape || shape.length === 0) return;

    fitMapToPoints(map, shape, { isDesktop, reserveBottomSpace: !isDesktop });
  }, [focusedVehicle, shapes, isDesktop]);

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

  const handleMove = useCallback((evt: { viewState: typeof INITIAL_VIEW_STATE }) => {
    const next = { ...evt.viewState };
    if (followingRef.current && focusedVehicleRef.current) {
      next.longitude = focusedVehicleRef.current.longitude;
      next.latitude = focusedVehicleRef.current.latitude;
    }
    setViewState(next);
  }, []);

  const handleMouseMove = useCallback((e: MapLayerMouseEvent) => {
    const hasInteractiveFeature = !!e.features?.some(
      (f) =>
        f.layer?.id === MAP_LAYER_IDS.VEHICLES ||
        f.layer?.id === MAP_LAYER_IDS.ALL_STOPS ||
        f.layer?.id === MAP_LAYER_IDS.ALL_STOPS_HIT,
    );
    setHoveringInteractive(hasInteractiveFeature);
  }, []);

  const routeLegsGeoJson = useMemo(() => {
    return buildRouteLegFeatures(routePlan, selectedRouteIndex);
  }, [routePlan, selectedRouteIndex]);

  const vehicleRouteGeoJson = useMemo(() => {
    return buildVehicleRouteFeature(focusedVehicle, shapes);
  }, [focusedVehicle, shapes]);

  const vehiclesGeoJson = useMemo(
    () => buildVehiclesFeatureCollection(vehicles, focusedVehicleId),
    [vehicles, focusedVehicleId],
  );

  const allStopsGeoJson = useMemo(
    () => buildStopsFeatureCollection(allStops),
    [allStops],
  );

  const boardingStops = useMemo(() => {
    return buildBoardingStops(routePlan, selectedRouteIndex);
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
        onMove={handleMove}
        onMoveEnd={handleMoveEnd}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveringInteractive(false)}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={() => setIsDragging(false)}
        cursor={isDragging ? "grabbing" : hoveringInteractive ? "pointer" : "grab"}
        interactiveLayerIds={
          showStops
            ? [MAP_LAYER_IDS.VEHICLES, MAP_LAYER_IDS.ALL_STOPS_HIT, MAP_LAYER_IDS.ALL_STOPS]
            : [MAP_LAYER_IDS.VEHICLES]
        }
        onClick={handleMapClick}
        onLoad={handleMapLoad}
        style={{ width: "100%", height: "100%" }}
        mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        attributionControl={false}
      >
        {!webglLost && vehicleRouteGeoJson && !routePlan && (
          <Source id={MAP_LAYER_IDS.VEHICLE_ROUTE} type="geojson" data={vehicleRouteGeoJson}>
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
                "line-color": ROUTE_LEG_COLOR_EXPRESSION,
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
              <IncidentIcon category={feature.properties.iconCategory} size={32} />
            </Marker>
          ))}

        {origin && (
          <Marker longitude={origin.lng} latitude={origin.lat} anchor="bottom">
            <PinIcon color="#22c55e" label="A" />
          </Marker>
        )}

        {destination && (
          <Marker longitude={destination.lng} latitude={destination.lat} anchor="bottom">
            <PinIcon color="#ef4444" label="B" />
          </Marker>
        )}

        {boardingStops.map((stop, i) => {
          const color = stop.transportType
            ? TYPE_COLORS[stop.transportType] || TYPE_COLORS.bus
            : "#22c55e";
          return (
            <Marker key={`boarding-${i}`} longitude={stop.lng} latitude={stop.lat} anchor="center">
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

        {!webglLost && showStops && (
          <Source id="all-stops-source" type="geojson" data={allStopsGeoJson}>
            <Layer
              id={MAP_LAYER_IDS.ALL_STOPS_HIT}
              type="circle"
              minzoom={12}
              paint={{
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 8, 13, 10, 16, 12],
                "circle-color": "#000000",
                "circle-opacity": 0.01,
              }}
            />
            <Layer
              id={MAP_LAYER_IDS.ALL_STOPS}
              type="circle"
              minzoom={12}
              paint={{
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 2, 13, 3, 16, 5],
                "circle-color": "#ffffff",
                "circle-stroke-color": "#4b5563",
                "circle-stroke-width": 1,
                "circle-opacity": 0.85,
              }}
            />
          </Source>
        )}

        {userLocation && (
          <Marker longitude={userLocation.lng} latitude={userLocation.lat} anchor="center">
            <UserLocationDot />
          </Marker>
        )}

        {!webglLost && (
          <Source id={MAP_LAYER_IDS.VEHICLES} type="geojson" data={vehiclesGeoJson}>
            <Layer
              id={MAP_LAYER_IDS.VEHICLES}
              type="symbol"
              layout={{
                "icon-image": "vehicle-arrow",
                "icon-rotation-alignment": "map",
                "icon-rotate": ["get", "bearing"],
                "icon-allow-overlap": true,
                "icon-ignore-placement": true,
                "icon-size": ["case", ["==", ["get", "focused"], 1], 1.0, 0.75],
                "symbol-sort-key": ["case", ["==", ["get", "focused"], 1], 1, 0],
              }}
              paint={{
                "icon-color": ["case", ["==", ["get", "focused"], 1], "#FF9800", ["get", "color"]],
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
            <StopPopup stop={popupStop} arrivals={stopArrivals} loading={arrivalsLoading} />
          </Popup>
        )}
      </Map>

      {userLocation && (
        <button
          onClick={handleLocateMe}
          className="absolute bottom-[88px] md:bottom-6 left-3 z-10 w-12 h-12 rounded-xl bg-white shadow-fab flex items-center justify-center text-foreground/60 hover:text-foreground/80 active:scale-95 transition-all duration-150"
          title="Center on my location"
        >
          <Icon name="crosshair" className="w-5 h-5" />
        </button>
      )}

      {/* Mobile bottom sheet */}
      <BottomSheet open={!!(popupVehicle || popupStop)} onClose={handleBottomSheetClose}>
        {popupVehicle && <VehiclePopup vehicle={popupVehicle} />}
        {popupStop && (
          <StopPopup stop={popupStop} arrivals={stopArrivals} loading={arrivalsLoading} />
        )}
      </BottomSheet>
    </>
  );
}
