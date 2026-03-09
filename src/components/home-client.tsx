"use client";

import { useCallback, useRef, useState } from "react";
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
import { useTransitStore, createPlannerStop, type PlannerStop } from "@/store/use-transit-store";
import { dismissOverlay, navigateTo } from "@/lib/navigation";
import type {
  MultiRoutePlanRequest,
  RouteLeg,
  RoutePlanRequest,
  RoutePlanResponse,
  LineDto,
} from "@/lib/types";
import { modeToTransportType, normalizeLineType } from "@/lib/domain";
import { planMultiRouteAsync, planRouteAsync } from "@/actions";
import {
  fastestMultiRoute,
  fastestRoutes,
  lessWalkingRoutes,
  fewerTransfersRoutes,
  mergeAndDedupeRoutes,
  type RoutingMode,
} from "@/lib/route-filter";
import { getBrowserClientId } from "@/lib/browser-client-id";

type ShapesMap = Record<string, number[][]>;

interface HomeClientProps {
  shapes: ShapesMap;
  lines: LineDto[];
}

function hasResolvedStops(stops: PlannerStop[]) {
  return stops.length >= 2 && stops.every((stop) => !!stop.point);
}

function hasConsecutiveDuplicateStops(stops: PlannerStop[]) {
  for (let index = 0; index < stops.length - 1; index += 1) {
    const current = stops[index].point;
    const next = stops[index + 1].point;
    if (!current || !next) continue;
    if (Math.abs(current.lat - next.lat) < 0.0001 && Math.abs(current.lng - next.lng) < 0.0001) {
      return true;
    }
  }
  return false;
}

function normalizeStopPoint(stop: PlannerStop) {
  const point = stop.point;
  if (!point) return null;
  return {
    lat: point.lat,
    lng: point.lng,
    name: point.name ?? "",
  };
}

function isMultiStopJourney(stops: PlannerStop[]) {
  return stops.length > 2;
}

function createEmptyRouteCache() {
  return { fastest: null, lessWalking: null, fewerTransfers: null };
}

function createEmptyMultiRouteCache() {
  return { fastest: null, lessWalking: null, fewerTransfers: null };
}

function parseIsoDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function timeToIsoDateTime(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  if (h == null || m == null || Number.isNaN(h) || Number.isNaN(m)) return null;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function canPlanJourney(stops: PlannerStop[], timeOption: "now" | "depart" | "arrive", selectedDateTime: string) {
  if (!hasResolvedStops(stops) || hasConsecutiveDuplicateStops(stops)) return false;
  return timeOption === "now" || parseIsoDateTime(selectedDateTime) !== null;
}

function resolveActivePlan<T>(
  cache: { fastest: T; lessWalking: T; fewerTransfers: T },
  routingMode: RoutingMode,
) {
  return routingMode === "fastest"
    ? cache.fastest
    : routingMode === "less-walking"
      ? cache.lessWalking
      : cache.fewerTransfers;
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
    plannerStops,
    setPlannerStops,
    setPickingPoint,
    setRoutePlan,
    setMultiRoutePlan,
    setPlanError,
    setPlanLoading,
    setSelectedRouteIndex,
    bumpRouteFitRequest,
    focusedVehicleId,
    setFocusedVehicleId,
    timeOption,
    setTimeOption,
    selectedDateTime,
    setSelectedDateTime,
    clearPlanner,
    routingMode,
    setRouteCache,
    setMultiRouteCache,
  } = useTransitStore();
  const userLocation = useUserLocation();
  const isDesktop = useIsDesktop();

  const pickingFromPlannerRef = useRef(false);
  const hasPlanSearchedRef = useRef(false);
  const latestPlanRequestIdRef = useRef(0);
  const draftVersionRef = useRef(0);
  const vehiclesBeforeLocateRef = useRef<boolean | null>(null);
  const showVehiclesRef = useRef(showVehicles);
  showVehiclesRef.current = showVehicles;
  const [draftVersion, setDraftVersion] = useState(0);
  const [plannedDraftVersion, setPlannedDraftVersion] = useState<number | null>(null);

  const lineFilter = selectedLine?.lineNumber ?? "";
  const typeFilter = selectedLine?.type ?? "all";
  const { vehicles: rawVehicles, loading } = useVehicleStream(lineFilter, typeFilter, showVehicles);
  const vehicles = useAnimatedVehicles(rawVehicles);

  const handleVehicleClick = useCallback(
    (vehicleId: string) => {
      setFocusedVehicleId(focusedVehicleId === vehicleId ? null : vehicleId);
      const vehicle = vehicles.find((item) => item.id === vehicleId);
      if (vehicle) {
        setSelectedLine({ lineNumber: vehicle.lineNumber, type: normalizeLineType(vehicle.transportType) });
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

  const resetPlannerResults = useCallback(() => {
    setRoutePlan(null);
    setMultiRoutePlan(null);
    setPlanError(null);
    setSelectedRouteIndex(0);
    setSelectedLine(null);
    setSelectedStop(null);
    setRouteCache(createEmptyRouteCache());
    setMultiRouteCache(createEmptyMultiRouteCache());
  }, [
    setMultiRouteCache,
    setMultiRoutePlan,
    setPlanError,
    setRouteCache,
    setRoutePlan,
    setSelectedLine,
    setSelectedRouteIndex,
    setSelectedStop,
  ]);

  const markDraftChanged = useCallback(() => {
    latestPlanRequestIdRef.current += 1;
    draftVersionRef.current += 1;
    setDraftVersion(draftVersionRef.current);
    setPlannedDraftVersion(null);
    setPlanLoading(false);
    resetPlannerResults();
    return draftVersionRef.current;
  }, [resetPlannerResults, setPlanLoading]);

  const runPlanForDraft = useCallback(async ({
    plannerStops: draftStops,
    timeOption: draftTimeOption,
    selectedDateTime: draftSelectedDateTime,
    draftVersion: requestedDraftVersion,
    routingMode: requestedRoutingMode,
  }: {
    plannerStops: PlannerStop[];
    timeOption: "now" | "depart" | "arrive";
    selectedDateTime: string;
    draftVersion: number;
    routingMode: RoutingMode;
  }) => {
    if (requestedDraftVersion !== draftVersionRef.current) return;
    if (!canPlanJourney(draftStops, draftTimeOption, draftSelectedDateTime)) return;

    const requestId = latestPlanRequestIdRef.current + 1;
    latestPlanRequestIdRef.current = requestId;
    setPlannedDraftVersion(null);
    setPlanLoading(true);
    resetPlannerResults();

    try {
      const clientId = getBrowserClientId() ?? undefined;
      const resolvedStops = draftStops.map(normalizeStopPoint);
      if (resolvedStops.some((stop) => !stop)) return;

      if (!isMultiStopJourney(draftStops)) {
        const origin = resolvedStops[0]!;
        const destination = resolvedStops[resolvedStops.length - 1]!;
        const baseReq: RoutePlanRequest = {
          originLat: origin.lat,
          originLng: origin.lng,
          destinationLat: destination.lat,
          destinationLng: destination.lng,
        };

        const scheduledIsoDateTime = parseIsoDateTime(draftSelectedDateTime);
        if (draftTimeOption === "now") {
          const dateTime = new Date();
          baseReq.departureTime = dateTime.toISOString();
        } else if (draftTimeOption === "depart" && scheduledIsoDateTime) {
          baseReq.departureTime = scheduledIsoDateTime;
        } else if (draftTimeOption === "arrive" && scheduledIsoDateTime) {
          baseReq.arrivalTime = scheduledIsoDateTime;
        }

        const [fewerTransfersResult, lessWalkingResult] = await Promise.all([
          planRouteAsync({ ...baseReq, routingPreference: "FEWER_TRANSFERS" }, clientId),
          planRouteAsync({ ...baseReq, routingPreference: "LESS_WALKING" }, clientId),
        ]);

        if (latestPlanRequestIdRef.current !== requestId) return;

        const fewerTransfersData = fewerTransfersResult.data ?? { routes: [] };
        const lessWalkingData = lessWalkingResult.data ?? { routes: [] };
        setPlanError(fewerTransfersResult.error ?? lessWalkingResult.error);

        const merged = mergeAndDedupeRoutes(fewerTransfersData, lessWalkingData);
        const fastestData: RoutePlanResponse = { routes: fastestRoutes(merged) };
        const cache = {
          fewerTransfers: { routes: fewerTransfersRoutes(merged) },
          lessWalking: { routes: lessWalkingRoutes(merged) },
          fastest: fastestData,
        };

        setRouteCache(cache);
        setMultiRouteCache(createEmptyMultiRouteCache());

        const activePlan = resolveActivePlan(cache, useTransitStore.getState().routingMode ?? requestedRoutingMode);
        setRoutePlan(activePlan);
        setMultiRoutePlan(null);
        setPlannedDraftVersion(requestedDraftVersion);
        if (activePlan.routes.length > 0) bumpRouteFitRequest();
      } else {
        const scheduledIsoDateTime = parseIsoDateTime(draftSelectedDateTime);
        const baseReq: MultiRoutePlanRequest = {
          stops: resolvedStops.map((stop, index) => ({
            lat: stop!.lat,
            lng: stop!.lng,
            name: stop!.name,
            dwellMinutes:
              index > 0 && index < resolvedStops.length - 1 && !draftStops[index].departureOverride
                ? draftStops[index].dwellMinutes || undefined
                : undefined,
            departureOverride:
              index > 0 &&
              index < resolvedStops.length - 1 &&
              draftStops[index].departureOverride
                ? timeToIsoDateTime(draftStops[index].departureOverride) ?? undefined
                : undefined,
          })),
          timeMode: draftTimeOption,
          anchorTime: draftTimeOption === "now" ? undefined : scheduledIsoDateTime ?? undefined,
        };

        const [fewerTransfersResult, lessWalkingResult] = await Promise.all([
          planMultiRouteAsync({ ...baseReq, routingPreference: "FEWER_TRANSFERS" }, clientId),
          planMultiRouteAsync({ ...baseReq, routingPreference: "LESS_WALKING" }, clientId),
        ]);

        if (latestPlanRequestIdRef.current !== requestId) return;

        const cache = {
          fewerTransfers: fewerTransfersResult.data,
          lessWalking: lessWalkingResult.data,
          fastest: fastestMultiRoute(fewerTransfersResult.data, lessWalkingResult.data) ?? null,
        };

        setRoutePlan(null);
        setRouteCache(createEmptyRouteCache());
        setMultiRouteCache(cache);
        setPlanError(fewerTransfersResult.error ?? lessWalkingResult.error);

        const activePlan = resolveActivePlan(cache, useTransitStore.getState().routingMode ?? requestedRoutingMode);
        setMultiRoutePlan(activePlan ?? null);
        setPlannedDraftVersion(requestedDraftVersion);
        if (activePlan?.itinerary) bumpRouteFitRequest();
      }
    } catch {
      if (latestPlanRequestIdRef.current !== requestId) return;
      setPlanError("Failed to plan route.");
    } finally {
      if (latestPlanRequestIdRef.current !== requestId) return;
      setPlanLoading(false);
      hasPlanSearchedRef.current = true;
    }
  }, [
    bumpRouteFitRequest,
    setMultiRouteCache,
    setMultiRoutePlan,
    setPlanError,
    setPlanLoading,
    setRouteCache,
    setRoutePlan,
    setSelectedLine,
    setSelectedRouteIndex,
    setSelectedStop,
    resetPlannerResults,
  ]);

  const updateStops = useCallback(
    (producer: (current: PlannerStop[]) => PlannerStop[]) => {
      const nextStops = producer(plannerStops);
      if (nextStops === plannerStops) return;
      setPlannerStops(nextStops);
      markDraftChanged();
    },
    [markDraftChanged, plannerStops, setPlannerStops],
  );

  const handleMapClick = useCallback(
    (stopId: string, lat: number, lng: number) => {
      const nextStops = plannerStops.map((stop) =>
        stop.id === stopId ? { ...stop, point: { lat, lng } } : stop,
      );
      setPlannerStops(nextStops);
      markDraftChanged();
      setPickingPoint(null);
      if (pickingFromPlannerRef.current) {
        pickingFromPlannerRef.current = false;
        setShowPlanner(true);
        navigateTo("directions");
      }
    },
    [
      markDraftChanged,
      plannerStops,
      setPickingPoint,
      setPlannerStops,
      setShowPlanner,
    ],
  );

  const handleSwapEndpoints = useCallback(() => {
    if (plannerStops.length !== 2) return;
    const nextStops = [
      { ...plannerStops[0], point: plannerStops[1].point },
      { ...plannerStops[1], point: plannerStops[0].point },
    ];
    setPlannerStops(nextStops);
    markDraftChanged();
  }, [markDraftChanged, plannerStops, setPlannerStops]);

  const handleAddStop = useCallback(() => {
    if (plannerStops.length >= 5) return;
    updateStops((current) => {
      const next = [...current];
      next.splice(Math.max(1, current.length - 1), 0, createPlannerStop());
      return next;
    });
  }, [plannerStops.length, updateStops]);

  const handleReturnToStart = useCallback(() => {
    const firstPoint = plannerStops[0]?.point;
    if (!firstPoint || plannerStops.length >= 5) return;

    const lastPoint = plannerStops[plannerStops.length - 1]?.point;
    if (
      lastPoint &&
      Math.abs(lastPoint.lat - firstPoint.lat) < 0.0001 &&
      Math.abs(lastPoint.lng - firstPoint.lng) < 0.0001
    ) {
      return;
    }

    updateStops((current) => [...current, createPlannerStop({ point: { ...firstPoint } })]);
  }, [plannerStops, updateStops]);

  const handleMoveStop = useCallback(
    (stopId: string, direction: -1 | 1) => {
      updateStops((current) => {
        const index = current.findIndex((stop) => stop.id === stopId);
        const nextIndex = index + direction;
        if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
        const next = [...current];
        const [item] = next.splice(index, 1);
        next.splice(nextIndex, 0, item);
        return next;
      });
    },
    [updateStops],
  );

  const handleTimeOptionChange = useCallback(
    (nextTimeOption: "now" | "depart" | "arrive") => {
      if (nextTimeOption === timeOption) return;
      setTimeOption(nextTimeOption);
      markDraftChanged();
    },
    [markDraftChanged, setTimeOption, timeOption],
  );

  const handleDateTimeChange = useCallback(
    (nextSelectedDateTime: string) => {
      if (nextSelectedDateTime === selectedDateTime) return;
      setSelectedDateTime(nextSelectedDateTime);
      markDraftChanged();
    },
    [markDraftChanged, selectedDateTime, setSelectedDateTime],
  );

  const handlePlanRoute = useCallback(() => {
    if (!canPlanJourney(plannerStops, timeOption, selectedDateTime)) return;
    void runPlanForDraft({
      plannerStops,
      timeOption,
      selectedDateTime,
      draftVersion: draftVersionRef.current,
      routingMode,
    });
  }, [plannerStops, routingMode, runPlanForDraft, selectedDateTime, timeOption]);

  const handleRemoveStop = useCallback(
    (stopId: string) => {
      updateStops((current) => {
        const index = current.findIndex((stop) => stop.id === stopId);
        if (index <= 0 || current.length <= 2) return current;
        return current.filter((stop) => stop.id !== stopId);
      });
    },
    [updateStops],
  );

  const handleSetStopPoint = useCallback(
    (stopId: string, place: { lat: number; lng: number; name?: string }) => {
      const nextStops = plannerStops.map((stop) =>
        stop.id === stopId ? { ...stop, point: place } : stop,
      );
      setPlannerStops(nextStops);
      markDraftChanged();
    },
    [markDraftChanged, plannerStops, setPlannerStops],
  );

  const handleSetStopDwell = useCallback(
    (stopId: string, dwellMinutes: number) => {
      updateStops((current) =>
        current.map((stop) => (stop.id === stopId ? { ...stop, dwellMinutes } : stop)),
      );
    },
    [updateStops],
  );

  const handleSetStopDepartureOverride = useCallback(
    (stopId: string, departureOverride: string) => {
      updateStops((current) =>
        current.map((stop) => (stop.id === stopId ? { ...stop, departureOverride } : stop)),
      );
    },
    [updateStops],
  );

  const handleLocateVehicle = useCallback((leg: RouteLeg) => {
    if (leg.mode !== "WALK") {
      vehiclesBeforeLocateRef.current = showVehiclesRef.current;
      setSelectedLine({
        lineNumber: leg.lineNumber || "",
        type: modeToTransportType(leg.mode),
      });
      setShowVehicles(true);
    }
  }, [setSelectedLine, setShowVehicles]);

  const handleToggleVehicles = useCallback(() => {
    vehiclesBeforeLocateRef.current = null;
    toggleVehicles();
  }, [toggleVehicles]);

  const handleClearPlanner = useCallback(() => {
    latestPlanRequestIdRef.current += 1;
    clearPlanner();
    draftVersionRef.current = 0;
    setDraftVersion(0);
    setPlannedDraftVersion(null);
    setPlanLoading(false);
    hasPlanSearchedRef.current = false;
    vehiclesBeforeLocateRef.current = null;
  }, [clearPlanner, setPlanLoading]);

  const handlePlannerClose = useCallback(() => {
    setShowPlanner(false);
    if (!isDesktop) dismissOverlay(null);
  }, [isDesktop, setShowPlanner]);

  const handleRouteSelect = useCallback((index: number) => {
    setSelectedRouteIndex(index);
    bumpRouteFitRequest();
  }, [bumpRouteFitRequest, setSelectedRouteIndex]);

  const hasSearchedCurrentDraft = plannedDraftVersion === draftVersion && hasPlanSearchedRef.current;

  return (
    <div className="h-dvh flex flex-col">
      <HomeStateEffects />
      <FilterPanel vehicleCount={vehicles.length} lines={lines} />

      <div className="flex-1 flex relative overflow-hidden">
        <HomeRoutePlannerLayer
          isDesktop={isDesktop}
          userLocation={userLocation}
          onStartPicking={(stopId) => {
            if (stopId && !isDesktop) {
              pickingFromPlannerRef.current = true;
              setShowPlanner(false);
              navigateTo(null);
            } else {
              pickingFromPlannerRef.current = false;
            }
            setPickingPoint(stopId);
          }}
          onSetStopPoint={handleSetStopPoint}
          onSetStopDwell={handleSetStopDwell}
          onSetStopDepartureOverride={handleSetStopDepartureOverride}
          onAddStop={handleAddStop}
          onMoveStop={handleMoveStop}
          onRemoveStop={handleRemoveStop}
          onReturnToStart={handleReturnToStart}
          onPlanRoute={handlePlanRoute}
          onSelectRoute={handleRouteSelect}
          onClose={handlePlannerClose}
          onLocateVehicle={handleLocateVehicle}
          onTimeOptionChange={handleTimeOptionChange}
          onDateTimeChange={handleDateTimeChange}
          onSwapEndpoints={handleSwapEndpoints}
          onClear={handleClearPlanner}
          hasSearchedCurrentDraft={hasSearchedCurrentDraft}
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
