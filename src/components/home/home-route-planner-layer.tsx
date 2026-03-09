"use client";

import { RoutePlanner } from "@/components/route-planner";
import { useTransitStore } from "@/store/use-transit-store";
import type { RouteLeg } from "@/lib/types";

interface HomeRoutePlannerLayerProps {
  isDesktop: boolean;
  userLocation: { lat: number; lng: number } | null;
  onStartPicking: (stopId: string | null) => void;
  onSetStopPoint: (stopId: string, place: { lat: number; lng: number; name?: string }) => void;
  onSetStopDepartureOverride: (stopId: string, departureOverride: string) => void;
  onAddStop: () => void;
  onMoveStop: (stopId: string, direction: -1 | 1) => void;
  onRemoveStop: (stopId: string) => void;
  onReturnToStart: () => void;
  onPlanRoute: () => void;
  onSelectRoute: (index: number) => void;
  onClose: () => void;
  onLocateVehicle: (leg: RouteLeg) => void;
  onTimeOptionChange: (option: "now" | "depart" | "arrive") => void;
  onDateTimeChange: (dateTime: string) => void;
  onSwapEndpoints: () => void;
  onClear: () => void;
  hasSearchedCurrentDraft: boolean;
}

export function HomeRoutePlannerLayer({
  isDesktop,
  userLocation,
  onStartPicking,
  onSetStopPoint,
  onSetStopDepartureOverride,
  onAddStop,
  onMoveStop,
  onRemoveStop,
  onReturnToStart,
  onPlanRoute,
  onSelectRoute,
  onClose,
  onLocateVehicle,
  onTimeOptionChange,
  onDateTimeChange,
  onSwapEndpoints,
  onClear,
  hasSearchedCurrentDraft,
}: HomeRoutePlannerLayerProps) {
  const showPlanner = useTransitStore((state) => state.showPlanner);
  const plannerStops = useTransitStore((state) => state.plannerStops);
  const pickingPoint = useTransitStore((state) => state.pickingPoint);
  const routePlan = useTransitStore((state) => state.routePlan);
  const multiRoutePlan = useTransitStore((state) => state.multiRoutePlan);
  const planError = useTransitStore((state) => state.planError);
  const planLoading = useTransitStore((state) => state.planLoading);
  const selectedRouteIndex = useTransitStore((state) => state.selectedRouteIndex);
  const openSelectedRouteDetails = useTransitStore((state) => state.openSelectedRouteDetails);
  const setOpenSelectedRouteDetails = useTransitStore((state) => state.setOpenSelectedRouteDetails);
  const timeOption = useTransitStore((state) => state.timeOption);
  const selectedDateTime = useTransitStore((state) => state.selectedDateTime);
  const activeOverlay = useTransitStore((state) => state.activeOverlay);

  const showPlannerComponent = isDesktop
    ? showPlanner
    : activeOverlay === "directions" || activeOverlay === "route-detail";
  if (!showPlannerComponent) return null;

  return (
    <RoutePlanner
      userLocation={userLocation}
      plannerStops={plannerStops}
      pickingPoint={pickingPoint}
      onStartPicking={onStartPicking}
      onSetStopPoint={onSetStopPoint}
      onSetStopDepartureOverride={onSetStopDepartureOverride}
      onAddStop={onAddStop}
      onMoveStop={onMoveStop}
      onRemoveStop={onRemoveStop}
      onReturnToStart={onReturnToStart}
      onPlanRoute={onPlanRoute}
      routePlan={routePlan}
      multiRoutePlan={multiRoutePlan}
      planError={planError}
      planLoading={planLoading}
      selectedRouteIndex={selectedRouteIndex}
      onSelectRoute={onSelectRoute}
      onClose={onClose}
      onLocateVehicle={onLocateVehicle}
      timeOption={timeOption}
      onTimeOptionChange={onTimeOptionChange}
      selectedDateTime={selectedDateTime}
      onDateTimeChange={onDateTimeChange}
      onSwapEndpoints={onSwapEndpoints}
      onClear={onClear}
      openSelectedRouteDetails={openSelectedRouteDetails}
      onConsumeOpenSelectedRouteDetails={() => setOpenSelectedRouteDetails(false)}
      hasSearchedCurrentDraft={hasSearchedCurrentDraft}
    />
  );
}
