"use client";

import { MapView } from "@/components/map-view";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useTransitStore } from "@/store/use-transit-store";
import type { VehicleDto } from "@/lib/types";

interface HomeMapLayerProps {
  shapes: Record<string, number[][]>;
  vehicles: VehicleDto[];
  loading: boolean;
  onMapClick: (pointType: string, lat: number, lng: number) => void;
  onVehicleClick: (id: number) => void;
  onDeselectVehicle: () => void;
}

export function HomeMapLayer({
  shapes,
  vehicles,
  loading,
  onMapClick,
  onVehicleClick,
  onDeselectVehicle,
}: HomeMapLayerProps) {
  const mapKey = useTransitStore((s) => s.mapKey);
  const routePlan = useTransitStore((s) => s.routePlan);
  const selectedRouteIndex = useTransitStore((s) => s.selectedRouteIndex);
  const routeFitRequest = useTransitStore((s) => s.routeFitRequest);
  const origin = useTransitStore((s) => s.origin);
  const destination = useTransitStore((s) => s.destination);
  const pickingPoint = useTransitStore((s) => s.pickingPoint);
  const focusedVehicleId = useTransitStore((s) => s.focusedVehicleId);
  const selectedStop = useTransitStore((s) => s.selectedStop);
  const showTraffic = useTransitStore((s) => s.showTraffic);
  const showStops = useTransitStore((s) => s.showStops);

  return (
    <>
      {loading && <LoadingOverlay />}
      <MapView
        key={mapKey}
        vehicles={vehicles}
        routePlan={routePlan}
        selectedRouteIndex={selectedRouteIndex}
        origin={origin}
        destination={destination}
        pickingPoint={pickingPoint}
        onMapClick={onMapClick}
        focusedVehicleId={focusedVehicleId}
        routeFitRequest={routeFitRequest}
        shapes={shapes}
        onVehicleClick={onVehicleClick}
        onDeselectVehicle={onDeselectVehicle}
        selectedStop={selectedStop}
        showTraffic={showTraffic}
        showStops={showStops}
      />
    </>
  );
}
