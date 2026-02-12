"use client";

import { useMemo } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
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
