"use client";

import dynamic from "next/dynamic";
import type { VehicleDto, RoutePlanResponse } from "@/lib/types";
import type { StopDto } from "@/app/api/all-stops/route";

const MapViewInner = dynamic(
  () => import("./map-view-inner").then((mod) => mod.MapViewInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full w-full bg-background">
        <div className="text-muted-foreground">Loading map...</div>
      </div>
    ),
  },
);

interface MapViewProps {
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

export function MapView(props: MapViewProps) {
  return <MapViewInner {...props} />;
}
