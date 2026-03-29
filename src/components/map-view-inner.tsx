"use client";

import { useMemo, useCallback, useRef, useEffect, useReducer, type RefObject } from "react";
import Map, { Marker, Source, Layer, Popup, type MapRef } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MultiRoutePlanResponse, RoutePlanResponse, StopDto, VehicleDto } from "@/lib/types";
import { TALLINN_CENTER, DEFAULT_ZOOM, TYPE_COLORS } from "@/lib/constants";
import { BottomSheet } from "@/components/bottom-sheet";
import type { MapLayerMouseEvent, Map as MapLibreMap } from "maplibre-gl";
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
import { useVehicleEta } from "@/hooks/use-vehicle-eta";
import { useStopPopupArrivals } from "@/hooks/use-stop-popup-arrivals";
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
import type { PlannerStop } from "@/store/use-transit-store";

const INITIAL_VIEW_STATE = {
  longitude: TALLINN_CENTER[1],
  latitude: TALLINN_CENTER[0],
  zoom: DEFAULT_ZOOM,
};

const MOBILE_FOCUSED_VEHICLE_VERTICAL_OFFSET_RATIO = 0.1;

type ViewState = typeof INITIAL_VIEW_STATE;
type MapBounds = {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
} | null;

interface MapUiState {
  viewState: ViewState;
  popupVehicle: VehicleDto | null;
  hoveringInteractive: boolean;
  isDragging: boolean;
  webglLost: boolean;
  mapBounds: MapBounds;
}

const INITIAL_UI_STATE: MapUiState = {
  viewState: INITIAL_VIEW_STATE,
  popupVehicle: null,
  hoveringInteractive: false,
  isDragging: false,
  webglLost: false,
  mapBounds: null,
};

type MapUiAction =
  | { type: "setViewState"; viewState: ViewState }
  | { type: "setPopupVehicle"; popupVehicle: VehicleDto | null }
  | {
      type: "syncFocusedVehicle";
      popupVehicle: VehicleDto | null;
      viewStatePatch?: Partial<ViewState>;
    }
  | { type: "centerOnStop"; stop: StopDto }
  | { type: "setHoveringInteractive"; hoveringInteractive: boolean }
  | { type: "setDragging"; isDragging: boolean }
  | { type: "setWebglLost"; webglLost: boolean }
  | { type: "setMapBounds"; mapBounds: MapBounds };

function mapUiReducer(state: MapUiState, action: MapUiAction): MapUiState {
  switch (action.type) {
    case "setViewState":
      return { ...state, viewState: action.viewState };
    case "setPopupVehicle":
      return { ...state, popupVehicle: action.popupVehicle };
    case "syncFocusedVehicle":
      return {
        ...state,
        popupVehicle: action.popupVehicle,
        viewState: action.viewStatePatch
          ? { ...state.viewState, ...action.viewStatePatch }
          : state.viewState,
      };
    case "centerOnStop":
      return {
        ...state,
        popupVehicle: null,
        viewState: {
          ...state.viewState,
          longitude: action.stop.longitude,
          latitude: action.stop.latitude,
          zoom: Math.max(state.viewState.zoom, 15),
        },
      };
    case "setHoveringInteractive":
      return { ...state, hoveringInteractive: action.hoveringInteractive };
    case "setDragging":
      return { ...state, isDragging: action.isDragging };
    case "setWebglLost":
      return { ...state, webglLost: action.webglLost };
    case "setMapBounds":
      return { ...state, mapBounds: action.mapBounds };
    default:
      return state;
  }
}

function getMapBounds(map: MapLibreMap): Exclude<MapBounds, null> {
  const bounds = map.getBounds();
  return {
    minLat: bounds.getSouth(),
    minLng: bounds.getWest(),
    maxLat: bounds.getNorth(),
    maxLng: bounds.getEast(),
  };
}

function getIncidentMarkerKey(feature: {
  properties: { id: string | number };
  geometry: { coordinates: number[] };
}) {
  return `incident:${feature.properties.id}:${feature.geometry.coordinates[0]}:${feature.geometry.coordinates[1]}`;
}

function getBoardingStopKey(stop: {
  lat: number;
  lng: number;
  name: string;
  lineNumber?: string;
}) {
  return `boarding:${stop.lat}:${stop.lng}:${stop.name}:${stop.lineNumber ?? ""}`;
}

function getFocusedVehicleFlyToOffset(isDesktop: boolean): [number, number] {
  if (isDesktop || typeof window === "undefined") return [0, 0];
  return [0, -Math.round(window.innerHeight * MOBILE_FOCUSED_VEHICLE_VERTICAL_OFFSET_RATIO)];
}

interface MapCanvasProps {
  mapRef: RefObject<MapRef | null>;
  viewState: ViewState;
  popupVehicle: VehicleDto | null;
  popupStop: StopDto | null;
  stopArrivals: ReturnType<typeof useStopPopupArrivals>["stopArrivals"];
  arrivalsLoading: boolean;
  selectedStop: StopDto | null;
  routePlan: RoutePlanResponse | null;
  plannerStops: PlannerStop[];
  boardingStops: ReturnType<typeof buildBoardingStops>;
  allStopsGeoJson: ReturnType<typeof buildStopsFeatureCollection>;
  routeLegsGeoJson: ReturnType<typeof buildRouteLegFeatures>;
  vehicleRouteGeoJson: ReturnType<typeof buildVehicleRouteFeature>;
  vehiclesGeoJson: ReturnType<typeof buildVehiclesFeatureCollection>;
  userLocation: { lat: number; lng: number } | null;
  showTraffic: boolean;
  showStops: boolean;
  trafficData: ReturnType<typeof useTrafficData>;
  webglLost: boolean;
  isDesktop: boolean;
  hoveringInteractive: boolean;
  isDragging: boolean;
  vehicleEta: number | null;
  onMove: (event: { viewState: ViewState }) => void;
  onMoveEnd: () => void;
  onMouseMove: (event: MapLayerMouseEvent) => void;
  onMouseLeave: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMapClick: (event: MapLayerMouseEvent) => void;
  onMapLoad: () => void;
  onPopupVehicleClose: () => void;
  onPopupStopClose: () => void;
  onSelectedStopMarkerClick: (event: { originalEvent: { stopPropagation: () => void } }) => void;
}

function MapCanvas({
  mapRef,
  viewState,
  popupVehicle,
  popupStop,
  stopArrivals,
  arrivalsLoading,
  selectedStop,
  routePlan,
  plannerStops,
  boardingStops,
  allStopsGeoJson,
  routeLegsGeoJson,
  vehicleRouteGeoJson,
  vehiclesGeoJson,
  userLocation,
  showTraffic,
  showStops,
  trafficData,
  webglLost,
  isDesktop,
  hoveringInteractive,
  isDragging,
  vehicleEta,
  onMove,
  onMoveEnd,
  onMouseMove,
  onMouseLeave,
  onDragStart,
  onDragEnd,
  onMapClick,
  onMapLoad,
  onPopupVehicleClose,
  onPopupStopClose,
  onSelectedStopMarkerClick,
}: MapCanvasProps) {
  return (
    <Map
      ref={mapRef}
      {...viewState}
      onMove={onMove}
      onMoveEnd={onMoveEnd}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      cursor={isDragging ? "grabbing" : hoveringInteractive ? "pointer" : "grab"}
      interactiveLayerIds={
        showStops
          ? [MAP_LAYER_IDS.VEHICLES, MAP_LAYER_IDS.ALL_STOPS_HIT, MAP_LAYER_IDS.ALL_STOPS]
          : [MAP_LAYER_IDS.VEHICLES]
      }
      onClick={onMapClick}
      onLoad={onMapLoad}
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

      {showTraffic &&
        trafficData.incidents?.features.map((feature) => (
          <Marker
            key={getIncidentMarkerKey(feature)}
            longitude={feature.geometry.coordinates[0]}
            latitude={feature.geometry.coordinates[1]}
            anchor="center"
          >
            <IncidentIcon category={feature.properties.iconCategory} size={32} />
          </Marker>
        ))}

      {plannerStops.map((stop, index) => {
        if (!stop.point) return null;

        const label = String.fromCharCode(65 + index);
        const color =
          index === 0
            ? "#22c55e"
            : index === plannerStops.length - 1
              ? "#ef4444"
              : "#0f766e";

        return (
          <Marker key={stop.id} longitude={stop.point.lng} latitude={stop.point.lat} anchor="bottom">
            <PinIcon color={color} label={label} />
          </Marker>
        );
      })}

      {boardingStops.map((stop) => {
        const color = stop.transportType
          ? TYPE_COLORS[stop.transportType] || TYPE_COLORS.bus
          : "#22c55e";
        return (
          <Marker key={getBoardingStopKey(stop)} longitude={stop.lng} latitude={stop.lat} anchor="center">
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
          onClick={onSelectedStopMarkerClick}
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

      {!webglLost && isDesktop && popupVehicle && (
        <Popup
          longitude={popupVehicle.longitude}
          latitude={popupVehicle.latitude}
          anchor="bottom"
          offset={[0, -16]}
          closeButton={false}
          onClose={onPopupVehicleClose}
          maxWidth="280px"
        >
          <VehiclePopup vehicle={popupVehicle} etaSeconds={vehicleEta} />
        </Popup>
      )}

      {!webglLost && isDesktop && popupStop && (
        <Popup
          longitude={popupStop.longitude}
          latitude={popupStop.latitude}
          anchor="bottom"
          offset={[0, -10]}
          closeButton={false}
          onClose={onPopupStopClose}
          maxWidth="280px"
        >
          <StopPopup stop={popupStop} arrivals={stopArrivals} loading={arrivalsLoading} />
        </Popup>
      )}
    </Map>
  );
}

export interface MapViewInnerProps {
  vehicles: VehicleDto[];
  routePlan: RoutePlanResponse | null;
  multiRoutePlan: MultiRoutePlanResponse | null;
  selectedRouteIndex: number;
  routeFitRequest?: number;
  plannerStops: PlannerStop[];
  pickingPoint: string | null;
  onMapClick: (stopId: string, lat: number, lng: number) => void;
  focusedVehicleId: string | null;
  shapes: Record<string, number[][]> | null;
  onVehicleClick: (id: string) => void;
  onDeselectVehicle: () => void;
  selectedStop: StopDto | null;
  onSelectStop: (stop: StopDto) => void;
  onClearSelectedStop: () => void;
  showTraffic?: boolean;
  showStops?: boolean;
}

function useMapViewController({
  vehicles,
  routePlan,
  multiRoutePlan,
  selectedRouteIndex,
  routeFitRequest = 0,
  pickingPoint,
  onMapClick,
  focusedVehicleId,
  shapes,
  onVehicleClick,
  onDeselectVehicle,
  selectedStop,
  onSelectStop,
  onClearSelectedStop,
  showTraffic = false,
  showStops = false,
}: MapViewInnerProps) {
  const mapRef = useRef<MapRef>(null);
  const [state, dispatch] = useReducer(mapUiReducer, INITIAL_UI_STATE);
  const viewStateRef = useRef(INITIAL_VIEW_STATE);
  const {
    stopArrivals,
    arrivalsLoading,
    loadStopArrivalsAsync,
    clearStopArrivals,
  } = useStopPopupArrivals(selectedStop);
  const vehicleEta = useVehicleEta(state.popupVehicle);
  const isDesktop = useIsDesktop();
  const webglCleanupRef = useRef<(() => void) | null>(null);
  const vehiclesRef = useRef(vehicles);
  const popupVehicleKeyRef = useRef<string>("");

  const trafficData = useTrafficData(state.mapBounds, state.viewState.zoom, {
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

    const handleLost = (event: Event) => {
      event.preventDefault();
      dispatch({ type: "setWebglLost", webglLost: true });
    };
    const handleRestored = () => {
      dispatch({ type: "setWebglLost", webglLost: false });
      const currentMap = mapRef.current?.getMap();
      if (currentMap) addVehicleArrowImage(currentMap);
    };

    canvas.addEventListener("webglcontextlost", handleLost);
    canvas.addEventListener("webglcontextrestored", handleRestored);
    webglCleanupRef.current = () => {
      canvas.removeEventListener("webglcontextlost", handleLost);
      canvas.removeEventListener("webglcontextrestored", handleRestored);
    };

    dispatch({ type: "setMapBounds", mapBounds: getMapBounds(map) });
  }, []);

  useEffect(() => {
    return () => webglCleanupRef.current?.();
  }, []);

  useEffect(() => {
    vehiclesRef.current = vehicles;
  }, [vehicles]);

  useEffect(() => {
    viewStateRef.current = state.viewState;
  }, [state.viewState]);

  useEffect(() => {
    if (!focusedVehicleId) {
      dispatch({ type: "setPopupVehicle", popupVehicle: null });
      return;
    }

    const selectedVehicle = vehiclesRef.current.find((vehicle) => vehicle.id === focusedVehicleId) ?? null;
    if (!selectedVehicle) {
      dispatch({ type: "setPopupVehicle", popupVehicle: null });
      return;
    }

    const map = mapRef.current?.getMap();

    if (map) {
      const currentZoom = map.getZoom();
      map.flyTo({
        center: [selectedVehicle.longitude, selectedVehicle.latitude],
        zoom: Math.max(currentZoom, 14),
        offset: getFocusedVehicleFlyToOffset(isDesktop),
        duration: 600,
      });
      dispatch({ type: "setPopupVehicle", popupVehicle: selectedVehicle });
      return;
    }

    dispatch({
      type: "syncFocusedVehicle",
      popupVehicle: selectedVehicle,
      viewStatePatch: {
        longitude: selectedVehicle.longitude,
        latitude: selectedVehicle.latitude,
        zoom: Math.max(viewStateRef.current.zoom, 14),
      },
    });
  }, [focusedVehicleId, isDesktop]);

  const selectStop = useCallback((stop: StopDto) => {
    dispatch({ type: "setPopupVehicle", popupVehicle: null });
    onSelectStop(stop);
  }, [onSelectStop]);

  const handleMapClick = useCallback(
    (event: MapLayerMouseEvent) => {
      if (pickingPoint) {
        onMapClick(pickingPoint, event.lngLat.lat, event.lngLat.lng);
        return;
      }

      const vehicleFeature = event.features?.find((feature) => feature.layer?.id === MAP_LAYER_IDS.VEHICLES);
      if (vehicleFeature) {
        const rawVehicleId = vehicleFeature.properties?.id;
        const vehicleId = rawVehicleId == null ? undefined : String(rawVehicleId);
        const vehicle = vehiclesRef.current.find((item) => item.id === vehicleId);
        if (vehicle) {
          onVehicleClick(vehicle.id);
          dispatch({ type: "setPopupVehicle", popupVehicle: vehicle });
          onClearSelectedStop();
          return;
        }
      }

      const stopFeature = event.features?.find(
        (feature) =>
          feature.layer?.id === MAP_LAYER_IDS.ALL_STOPS ||
          feature.layer?.id === MAP_LAYER_IDS.ALL_STOPS_HIT,
      );
      if (stopFeature) {
        const stopId = String(stopFeature.properties?.stopId ?? "");
        const stop = allStops.find((item) => item.stopId === stopId);
        if (stop) {
          selectStop(stop);
          return;
        }
      }

      onDeselectVehicle();
      dispatch({ type: "setPopupVehicle", popupVehicle: null });
      onClearSelectedStop();
    },
    [allStops, onClearSelectedStop, onDeselectVehicle, onMapClick, onVehicleClick, pickingPoint, selectStop],
  );

  useEffect(() => {
    if (!selectedStop) {
      clearStopArrivals();
      return;
    }

    dispatch({ type: "centerOnStop", stop: selectedStop });
    void loadStopArrivalsAsync(selectedStop);
  }, [clearStopArrivals, loadStopArrivalsAsync, selectedStop]);

  useEffect(() => {
    if (!state.popupVehicle) return;
    const updatedVehicle = vehicles.find((vehicle) => vehicle.id === state.popupVehicle?.id);
    if (!updatedVehicle) return;

    const nextKey = [
      state.popupVehicle.id,
      updatedVehicle.stopIndex,
      updatedVehicle.distanceAlongRoute,
      updatedVehicle.nextStop?.name ?? "",
    ].join(":");
    if (nextKey === popupVehicleKeyRef.current) return;

    popupVehicleKeyRef.current = nextKey;
    dispatch({ type: "setPopupVehicle", popupVehicle: updatedVehicle });
  }, [state.popupVehicle, vehicles]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const points = multiRoutePlan?.itinerary
      ? multiRoutePlan.itinerary.segments.flatMap((segment) =>
          segment.route.legs.flatMap((leg) => leg.polyline),
        )
      : routePlan?.routes[selectedRouteIndex]?.legs.flatMap((leg) => leg.polyline) ?? [];
    if (points.length === 0) return;
    fitMapToPoints(map, points, { isDesktop, reserveBottomSpace: !isDesktop });
  }, [isDesktop, multiRoutePlan, routeFitRequest, routePlan, selectedRouteIndex]);

  const handleMoveEnd = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map) {
      dispatch({ type: "setMapBounds", mapBounds: getMapBounds(map) });
    }
  }, []);

  const handleMove = useCallback((event: { viewState: ViewState }) => {
    dispatch({ type: "setViewState", viewState: { ...event.viewState } });
  }, []);

  const handleMouseMove = useCallback((event: MapLayerMouseEvent) => {
    const hoveringInteractive = !!event.features?.some(
      (feature) =>
        feature.layer?.id === MAP_LAYER_IDS.VEHICLES ||
        feature.layer?.id === MAP_LAYER_IDS.ALL_STOPS ||
        feature.layer?.id === MAP_LAYER_IDS.ALL_STOPS_HIT,
    );
    dispatch({ type: "setHoveringInteractive", hoveringInteractive });
  }, []);

  const routeLegsGeoJson = useMemo(
    () => buildRouteLegFeatures(routePlan, selectedRouteIndex, multiRoutePlan),
    [multiRoutePlan, routePlan, selectedRouteIndex],
  );
  const focusedVehicle = useMemo(
    () => (focusedVehicleId == null ? null : vehicles.find((vehicle) => vehicle.id === focusedVehicleId) ?? null),
    [focusedVehicleId, vehicles],
  );
  const vehicleRouteGeoJson = useMemo(
    () => buildVehicleRouteFeature(focusedVehicle, shapes),
    [focusedVehicle, shapes],
  );
  const vehiclesGeoJson = useMemo(
    () => buildVehiclesFeatureCollection(vehicles, focusedVehicleId),
    [focusedVehicleId, vehicles],
  );
  const allStopsGeoJson = useMemo(() => buildStopsFeatureCollection(allStops), [allStops]);
  const boardingStops = useMemo(
    () => buildBoardingStops(routePlan, selectedRouteIndex, multiRoutePlan),
    [multiRoutePlan, routePlan, selectedRouteIndex],
  );

  const handleBottomSheetClose = useCallback(() => {
    dispatch({ type: "setPopupVehicle", popupVehicle: null });
    onClearSelectedStop();
    onDeselectVehicle();
  }, [onClearSelectedStop, onDeselectVehicle]);

  const handleLocateMe = useCallback(() => {
    if (!userLocation || !mapRef.current) return;
    const map = mapRef.current.getMap();
    const currentZoom = map?.getZoom() ?? DEFAULT_ZOOM;
    map?.flyTo({
      center: [userLocation.lng, userLocation.lat],
      zoom: Math.max(currentZoom, 15),
      duration: 600,
    });
  }, [userLocation]);

  return {
    mapRef,
    state,
    stopArrivals,
    arrivalsLoading,
    vehicleEta,
    userLocation,
    showTraffic,
    showStops,
    isDesktop,
    trafficData,
    routeLegsGeoJson,
    vehicleRouteGeoJson,
    vehiclesGeoJson,
    allStopsGeoJson,
    boardingStops,
    handleMove,
    handleMoveEnd,
    handleMouseMove,
    handleMapClick,
    handleMapLoad,
    handleBottomSheetClose,
    handleLocateMe,
    dispatch,
  };
}

export function MapViewInner(props: MapViewInnerProps) {
  const {
    routePlan,
    plannerStops,
    selectedStop,
  } = props;
  const {
    mapRef,
    state,
    stopArrivals,
    arrivalsLoading,
    vehicleEta,
    userLocation,
    showTraffic,
    showStops,
    isDesktop,
    trafficData,
    routeLegsGeoJson,
    vehicleRouteGeoJson,
    vehiclesGeoJson,
    allStopsGeoJson,
    boardingStops,
    handleMove,
    handleMoveEnd,
    handleMouseMove,
    handleMapClick,
    handleMapLoad,
    handleBottomSheetClose,
    handleLocateMe,
    dispatch,
  } = useMapViewController(props);

  return (
    <>
      <MapCanvas
        mapRef={mapRef}
        viewState={state.viewState}
        popupVehicle={state.popupVehicle}
        popupStop={selectedStop}
        stopArrivals={stopArrivals}
        arrivalsLoading={arrivalsLoading}
        selectedStop={selectedStop}
        routePlan={routePlan}
        plannerStops={plannerStops}
        boardingStops={boardingStops}
        allStopsGeoJson={allStopsGeoJson}
        routeLegsGeoJson={routeLegsGeoJson}
        vehicleRouteGeoJson={vehicleRouteGeoJson}
        vehiclesGeoJson={vehiclesGeoJson}
        userLocation={userLocation}
        showTraffic={showTraffic}
        showStops={showStops}
        trafficData={trafficData}
        webglLost={state.webglLost}
        isDesktop={isDesktop}
        hoveringInteractive={state.hoveringInteractive}
        isDragging={state.isDragging}
        vehicleEta={vehicleEta}
        onMove={handleMove}
        onMoveEnd={handleMoveEnd}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => dispatch({ type: "setHoveringInteractive", hoveringInteractive: false })}
        onDragStart={() => dispatch({ type: "setDragging", isDragging: true })}
        onDragEnd={() => dispatch({ type: "setDragging", isDragging: false })}
        onMapClick={handleMapClick}
        onMapLoad={handleMapLoad}
        onPopupVehicleClose={() => dispatch({ type: "setPopupVehicle", popupVehicle: null })}
        onPopupStopClose={props.onClearSelectedStop}
        onSelectedStopMarkerClick={(event) => {
          event.originalEvent.stopPropagation();
        }}
      />

      {userLocation && (
        <button
          onClick={handleLocateMe}
          className="fixed md:absolute left-2 md:left-3 z-10 h-12 w-12 rounded-full border border-foreground/10 bg-white/95 text-foreground/60 shadow-lg backdrop-blur-md flex items-center justify-center hover:text-foreground/80 active:scale-95 transition-all duration-150"
          style={{
            bottom: isDesktop
              ? "1.5rem"
              : "max(calc(5rem + env(safe-area-inset-bottom, 0px)), calc(var(--mobile-bottom-sheet-offset, 0px) + 0.75rem + env(safe-area-inset-bottom, 0px)))",
          }}
          title="Center on my location"
        >
          <Icon name="crosshair" className="w-5 h-5" />
        </button>
      )}

      <BottomSheet open={!!(state.popupVehicle || selectedStop)} onClose={handleBottomSheetClose}>
        {state.popupVehicle && <VehiclePopup vehicle={state.popupVehicle} etaSeconds={vehicleEta} />}
        {selectedStop && (
          <StopPopup stop={selectedStop} arrivals={stopArrivals} loading={arrivalsLoading} />
        )}
      </BottomSheet>
    </>
  );
}
