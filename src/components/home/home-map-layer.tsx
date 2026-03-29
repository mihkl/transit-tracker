"use client";

import { MapView } from "@/components/map-view";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useTransitStore } from "@/store/use-transit-store";
import type { VehicleDto } from "@/lib/types";

interface HomeMapLayerProps {
  shapes: Record<string, number[][]>;
  vehicles: VehicleDto[];
  loading: boolean;
  onMapClick: (stopId: string, lat: number, lng: number) => void;
  onVehicleClick: (id: string) => void;
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
  const multiRoutePlan = useTransitStore((s) => s.multiRoutePlan);
  const selectedRouteIndex = useTransitStore((s) => s.selectedRouteIndex);
  const routeFitRequest = useTransitStore((s) => s.routeFitRequest);
  const plannerStops = useTransitStore((s) => s.plannerStops);
  const pickingPoint = useTransitStore((s) => s.pickingPoint);
  const focusedVehicleId = useTransitStore((s) => s.focusedVehicleId);
  const selectedStop = useTransitStore((s) => s.selectedStop);
  const setSelectedStop = useTransitStore((s) => s.setSelectedStop);
  const showTraffic = useTransitStore((s) => s.showTraffic);
  const showStops = useTransitStore((s) => s.showStops);

  return (
    <>
      {loading && <LoadingOverlay />}
      <MapView
        key={mapKey}
        vehicles={vehicles}
        routePlan={routePlan}
        multiRoutePlan={multiRoutePlan}
        selectedRouteIndex={selectedRouteIndex}
        plannerStops={plannerStops}
        pickingPoint={pickingPoint}
        onMapClick={onMapClick}
        focusedVehicleId={focusedVehicleId}
        routeFitRequest={routeFitRequest}
        shapes={shapes}
        onVehicleClick={onVehicleClick}
        onDeselectVehicle={onDeselectVehicle}
        selectedStop={selectedStop}
        onSelectStop={setSelectedStop}
        onClearSelectedStop={() => setSelectedStop(null)}
        showTraffic={showTraffic}
        showStops={showStops}
      />
    </>
  );
}
