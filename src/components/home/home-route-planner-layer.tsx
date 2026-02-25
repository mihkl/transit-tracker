"use client";

import { RoutePlanner } from "@/components/route-planner";
import { useTransitStore } from "@/store/use-transit-store";
import type { RouteLeg } from "@/lib/types";

interface HomeRoutePlannerLayerProps {
  isDesktop: boolean;
  userLocation: { lat: number; lng: number } | null;
  onStartPicking: (point: "origin" | "destination" | null) => void;
  onSetOrigin: (place: { lat: number; lng: number; name?: string }) => void;
  onSetDestination: (place: { lat: number; lng: number; name?: string }) => void;
  onPlanRoute: () => void;
  onSelectRoute: (index: number) => void;
  onClose: () => void;
  onLocateVehicle: (leg: RouteLeg) => void;
  onSwap: () => void;
  onClear: () => void;
}

export function HomeRoutePlannerLayer({
  isDesktop,
  userLocation,
  onStartPicking,
  onSetOrigin,
  onSetDestination,
  onPlanRoute,
  onSelectRoute,
  onClose,
  onLocateVehicle,
  onSwap,
  onClear,
}: HomeRoutePlannerLayerProps) {
  const showPlanner = useTransitStore((s) => s.showPlanner);
  const origin = useTransitStore((s) => s.origin);
  const destination = useTransitStore((s) => s.destination);
  const pickingPoint = useTransitStore((s) => s.pickingPoint);
  const routePlan = useTransitStore((s) => s.routePlan);
  const planLoading = useTransitStore((s) => s.planLoading);
  const selectedRouteIndex = useTransitStore((s) => s.selectedRouteIndex);
  const openSelectedRouteDetails = useTransitStore((s) => s.openSelectedRouteDetails);
  const setOpenSelectedRouteDetails = useTransitStore((s) => s.setOpenSelectedRouteDetails);
  const timeOption = useTransitStore((s) => s.timeOption);
  const setTimeOption = useTransitStore((s) => s.setTimeOption);
  const selectedDateTime = useTransitStore((s) => s.selectedDateTime);
  const setSelectedDateTime = useTransitStore((s) => s.setSelectedDateTime);
  const mobileTab = useTransitStore((s) => s.mobileTab);

  const showPlannerComponent = isDesktop ? showPlanner : mobileTab === "directions";
  if (!showPlannerComponent) return null;

  return (
    <RoutePlanner
      userLocation={userLocation}
      origin={origin}
      destination={destination}
      pickingPoint={pickingPoint}
      onStartPicking={onStartPicking}
      onSetOrigin={onSetOrigin}
      onSetDestination={onSetDestination}
      onPlanRoute={onPlanRoute}
      routePlan={routePlan}
      planLoading={planLoading}
      selectedRouteIndex={selectedRouteIndex}
      onSelectRoute={onSelectRoute}
      onClose={onClose}
      onLocateVehicle={onLocateVehicle}
      timeOption={timeOption}
      onTimeOptionChange={setTimeOption}
      selectedDateTime={selectedDateTime}
      onDateTimeChange={setSelectedDateTime}
      onSwap={onSwap}
      onClear={onClear}
      openSelectedRouteDetails={openSelectedRouteDetails}
      onConsumeOpenSelectedRouteDetails={() => setOpenSelectedRouteDetails(false)}
    />
  );
}
