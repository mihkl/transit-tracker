"use client";

import { useCallback, useRef } from "react";
import { FilterPanel } from "@/components/filter-panel";
import { BottomNavigation } from "@/components/bottom-navigation";
import { HomeStateEffects } from "@/components/home/home-state-effects";
import { HomeRoutePlannerLayer } from "@/components/home/home-route-planner-layer";
import { HomeMapLayer } from "@/components/home/home-map-layer";
import { HomeMobileOverlays } from "@/components/home/home-mobile-overlays";
import { useVehicleStream } from "@/hooks/use-vehicle-stream";
import { useAnimatedVehicles } from "@/hooks/use-animated-vehicles";
import { useUserLocation } from "@/hooks/use-user-location";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { useTransitStore } from "@/store/use-transit-store";
import type { RoutePlanRequest, RouteLeg, LineDto } from "@/lib/types";
import { planRoute } from "@/actions";

type ShapesMap = Record<string, number[][]>;

interface HomeClientProps {
  shapes: ShapesMap;
  lines: LineDto[];
}

export function HomeClient({ shapes, lines }: HomeClientProps) {
  const {
    selectedLine,
    setSelectedLine,
    setSelectedStop,
    showVehicles,
    setShowVehicles,
    toggleVehicles,
    showPlanner,
    setShowPlanner,
    origin,
    setOrigin,
    destination,
    setDestination,
    setPickingPoint,
    setRoutePlan,
    setPlanLoading,
    setSelectedRouteIndex,
    bumpRouteFitRequest,
    focusedVehicleId,
    setFocusedVehicleId,
    timeOption,
    selectedDateTime,
    setMobileTab,
    goToMapTab,
    clearPlanner,
  } = useTransitStore();
  const userLocation = useUserLocation();

  const isDesktop = useIsDesktop();

  /* ── Refs ───────────────────────────────────────────────── */
  const pickingFromPlannerRef = useRef(false);
  const hasPlanSearchedRef = useRef(false);
  const vehiclesBeforeLocateRef = useRef<boolean | null>(null);
  const showVehiclesRef = useRef(showVehicles);
  showVehiclesRef.current = showVehicles;

  /* ── Vehicle stream ────────────────────────────────────── */
  const lineFilter = selectedLine?.lineNumber ?? "";
  const typeFilter = selectedLine?.type ?? "all";
  const { vehicles: rawVehicles, loading } = useVehicleStream(lineFilter, typeFilter, showVehicles);
  const vehicles = useAnimatedVehicles(rawVehicles);

  /* ── Callbacks ─────────────────────────────────────────── */
  const handleVehicleClick = useCallback(
    (vehicleId: number) => {
      setFocusedVehicleId(focusedVehicleId === vehicleId ? null : vehicleId);
      const v = vehicles.find((v) => v.id === vehicleId);
      if (v) {
        setSelectedLine({ lineNumber: v.lineNumber, type: v.transportType });
      }
    },
    [focusedVehicleId, setFocusedVehicleId, setSelectedLine, vehicles],
  );

  const handleDeselectVehicle = useCallback(() => {
    setFocusedVehicleId(null);
    setSelectedLine(null);
    if (vehiclesBeforeLocateRef.current !== null) {
      setShowVehicles(vehiclesBeforeLocateRef.current);
      vehiclesBeforeLocateRef.current = null;
    }
  }, [setFocusedVehicleId, setSelectedLine, setShowVehicles]);

  const handlePlanRoute = useCallback(async () => {
    if (!origin || !destination) return;
    setPlanLoading(true);
    setRoutePlan(null);
    setSelectedRouteIndex(0);
    setSelectedLine(null);
    setSelectedStop(null);
    try {
      const req: RoutePlanRequest = {
        originLat: origin.lat,
        originLng: origin.lng,
        destinationLat: destination.lat,
        destinationLng: destination.lng,
      };

      if ((timeOption === "depart" && selectedDateTime) || timeOption === "now") {
        const dt = timeOption === "now" ? new Date() : new Date(selectedDateTime);
        req.departureTime = dt.toISOString();
      } else if (timeOption === "arrive" && selectedDateTime) {
        req.arrivalTime = new Date(selectedDateTime).toISOString();
      }

      const data = await planRoute(req);
      setRoutePlan(data);
    } catch (err) {
      console.error("Failed to plan route:", err);
    } finally {
      setPlanLoading(false);
      hasPlanSearchedRef.current = true;
    }
  }, [
    destination,
    origin,
    selectedDateTime,
    setPlanLoading,
    setRoutePlan,
    setSelectedLine,
    setSelectedRouteIndex,
    setSelectedStop,
    timeOption,
  ]);

  const planRouteIfReady = useCallback(
    (newOrigin: typeof origin, newDest: typeof destination) => {
      if (hasPlanSearchedRef.current && newOrigin && newDest && showPlanner) {
        setTimeout(handlePlanRoute, 0);
      }
    },
    [handlePlanRoute, showPlanner],
  );

  const handleMapClick = useCallback(
    (pointType: string, lat: number, lng: number) => {
      const point = { lat, lng };
      if (pointType === "origin") {
        setOrigin(point);
        planRouteIfReady(point, destination);
      } else if (pointType === "destination") {
        setDestination(point);
        planRouteIfReady(origin, point);
      }
      setPickingPoint(null);
      if (pickingFromPlannerRef.current) {
        pickingFromPlannerRef.current = false;
        setShowPlanner(true);
        setMobileTab("directions");
      }
    },
    [destination, origin, planRouteIfReady, setDestination, setMobileTab, setOrigin, setPickingPoint, setShowPlanner],
  );

  const handleSwap = useCallback(() => {
    setOrigin(destination);
    setDestination(origin);
    planRouteIfReady(destination, origin);
  }, [destination, origin, planRouteIfReady, setDestination, setOrigin]);

  const handleLocateVehicle = useCallback((leg: RouteLeg) => {
    if (leg.mode && leg.mode !== "WALK") {
      vehiclesBeforeLocateRef.current = showVehiclesRef.current;
      setSelectedLine({
        lineNumber: leg.lineNumber || "",
        type: leg.mode.toLowerCase(),
      });
      setShowVehicles(true);
    }
  }, [setSelectedLine, setShowVehicles]);

  const handleToggleVehicles = useCallback(() => {
    vehiclesBeforeLocateRef.current = null;
    toggleVehicles();
  }, [toggleVehicles]);

  const handleClearPlanner = useCallback(() => {
    clearPlanner();
    hasPlanSearchedRef.current = false;
    vehiclesBeforeLocateRef.current = null;
  }, [clearPlanner]);

  const handleSetOrigin = useCallback(
    (place: { lat: number; lng: number; name?: string }) => {
      setOrigin(place);
      planRouteIfReady(place, destination);
    },
    [destination, planRouteIfReady, setOrigin],
  );

  const handleSetDestination = useCallback(
    (place: { lat: number; lng: number; name?: string }) => {
      setDestination(place);
      planRouteIfReady(origin, place);
    },
    [origin, planRouteIfReady, setDestination],
  );

  const handlePlannerClose = useCallback(() => {
    setShowPlanner(false);
    if (!isDesktop) goToMapTab();
  }, [goToMapTab, isDesktop, setShowPlanner]);

  const handleRouteSelect = useCallback((index: number) => {
    setSelectedRouteIndex(index);
    bumpRouteFitRequest();
  }, [bumpRouteFitRequest, setSelectedRouteIndex]);

  /* ── Render ────────────────────────────────────────────── */
  return (
    <div className="h-dvh flex flex-col">
      <HomeStateEffects />
      <FilterPanel vehicleCount={vehicles.length} lines={lines} />

      <div className="flex-1 flex relative overflow-hidden">
        <HomeRoutePlannerLayer
          isDesktop={isDesktop}
          userLocation={userLocation}
          onStartPicking={(pt) => {
            const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
            if (pt && isMobile) {
              pickingFromPlannerRef.current = true;
              setShowPlanner(false);
              setMobileTab("map");
            } else {
              pickingFromPlannerRef.current = false;
            }
            setPickingPoint(pt);
          }}
          onSetOrigin={handleSetOrigin}
          onSetDestination={handleSetDestination}
          onPlanRoute={handlePlanRoute}
          onSelectRoute={handleRouteSelect}
          onClose={handlePlannerClose}
          onLocateVehicle={handleLocateVehicle}
          onSwap={handleSwap}
          onClear={handleClearPlanner}
        />
        <div className="flex-1 relative">
          <HomeMapLayer
            shapes={shapes}
            vehicles={vehicles}
            loading={loading}
            onMapClick={handleMapClick}
            onVehicleClick={handleVehicleClick}
            onDeselectVehicle={handleDeselectVehicle}
          />
          <HomeMobileOverlays
            isDesktop={isDesktop}
            lines={lines}
            vehicleCount={vehicles.length}
            onToggleVehicles={handleToggleVehicles}
          />
        </div>
      </div>

      <BottomNavigation />
    </div>
  );
}
