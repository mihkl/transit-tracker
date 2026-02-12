"use client";

import { useMemo, useEffect } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { VehicleDto, RoutePlanResponse } from "@/lib/types";
import { TALLINN_CENTER, DEFAULT_ZOOM } from "@/lib/constants";
import { VehicleMarkers } from "./vehicle-markers";
import { VehicleRouteOverlay } from "./vehicle-route-overlay";
import { FlyToVehicle } from "./fly-to-vehicle";
import { RouteOverlay } from "./route-overlay";
import { MapClickHandler } from "./map-click-handler";

interface MapViewInnerProps {
  vehicles: VehicleDto[];
  routePlan: RoutePlanResponse | null;
  selectedRouteIndex: number;
  origin: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number } | null;
  pickingPoint: "origin" | "destination" | null;
  onMapClick: (pointType: string, lat: number, lng: number) => void;
  focusedVehicleId: number | null;
  selectedVehicleId: number | null;
  shapes: Record<string, number[][]> | null;
  onVehicleClick: (id: number) => void;
  onDeselectVehicle: () => void;
  showPlanner: boolean;
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
  selectedVehicleId,
  shapes,
  onVehicleClick,
  onDeselectVehicle,
  showPlanner,
}: MapViewInnerProps) {
  const selectedVehicle = useMemo(() => {
    if (selectedVehicleId == null) return null;
    return vehicles.find((v) => v.id === selectedVehicleId) ?? null;
  }, [vehicles, selectedVehicleId]);

  return (
    <MapContainer
      center={TALLINN_CENTER}
      zoom={DEFAULT_ZOOM}
      style={{ height: "100%", width: "100%" }}
      zoomControl={false}
      attributionControl={false}
    >
      {/* Ensure Leaflet recalculates size when planner overlay visibility changes */}
      <MapSizeInvalidator showPlanner={showPlanner} />
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      {selectedVehicle && shapes && (
        <VehicleRouteOverlay vehicle={selectedVehicle} shapes={shapes} disabled={!!routePlan} />
      )}
      <VehicleMarkers
        vehicles={vehicles}
        focusedVehicleId={focusedVehicleId}
        selectedVehicleId={selectedVehicleId}
        shapes={shapes}
        onVehicleClick={onVehicleClick}
      />
      <FlyToVehicle
        vehicles={vehicles}
        focusedVehicleId={focusedVehicleId}
        selectedVehicleId={selectedVehicleId}
      />
      <RouteOverlay
        routePlan={routePlan}
        selectedRouteIndex={selectedRouteIndex}
        origin={origin}
        destination={destination}
      />
      <MapClickHandler
        pickingPoint={pickingPoint}
        onMapClick={onMapClick}
        onDeselectVehicle={onDeselectVehicle}
      />
    </MapContainer>
  );
}

function MapSizeInvalidator({ showPlanner }: { showPlanner: boolean }) {
  // This component runs inside MapContainer so we can access the map via useMap
  const map = useMap();

  // Invalidate map size when showPlanner changes and on orientation/resize
  useEffect(() => {
    // Allow layout/transition to settle
    const t = setTimeout(() => {
      try {
        map.invalidateSize({ animate: false });
      } catch (e) {
        // ignore
      }
    }, 250);

    return () => clearTimeout(t);
  }, [showPlanner, map]);

  useEffect(() => {
    const onResize = () => {
      try {
        map.invalidateSize({ animate: false });
      } catch (e) {}
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [map]);

  return null;
}
