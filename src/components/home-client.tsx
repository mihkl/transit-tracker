"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Bus, Car, MapPin } from "lucide-react";
import { FilterPanel } from "@/components/filter-panel";
import { MapView } from "@/components/map-view";
import { RoutePlanner, type TimeOption } from "@/components/route-planner";
import { LoadingOverlay } from "@/components/loading-overlay";
import { BottomNavigation, type MobileTab } from "@/components/bottom-navigation";
import { BottomSheet } from "@/components/bottom-sheet";
import { QuickActionsPanel } from "@/components/quick-actions-panel";
import { MobileSearchView } from "@/components/mobile-search-view";
import { useVehicleStream } from "@/hooks/use-vehicle-stream";
import { useAnimatedVehicles } from "@/hooks/use-animated-vehicles";
import { useUserLocation } from "@/hooks/use-user-location";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import type {
  RoutePlanResponse,
  RoutePlanRequest,
  PlannedRoute,
  RouteLeg,
  LineDto,
  StopDto,
} from "@/lib/types";
import { planRoute } from "@/actions";

type ShapesMap = Record<string, number[][]>;
const ROUTE_SNAPSHOT_KEY = "transit-reminder-route-snapshot";
const SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

interface StoredRouteSnapshot {
  route: PlannedRoute;
  savedAt: number;
}

function toLocalDateTimeString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface HomeClientProps {
  shapes: ShapesMap;
  lines: LineDto[];
}

export function HomeClient({ shapes, lines }: HomeClientProps) {
  /* ── Core state ────────────────────────────────────────── */
  const [selectedLine, setSelectedLine] = useState<{
    lineNumber: string;
    type: string;
  } | null>(null);
  const [selectedStop, setSelectedStop] = useState<StopDto | null>(null);
  const [showTraffic, setShowTraffic] = useState(false);
  const [showVehicles, setShowVehicles] = useState(false);
  const [showStops, setShowStops] = useState(false);

  const [showPlanner, setShowPlanner] = useState(false);
  const [origin, setOrigin] = useState<{
    lat: number;
    lng: number;
    name?: string;
  } | null>(null);
  const [destination, setDestination] = useState<{
    lat: number;
    lng: number;
    name?: string;
  } | null>(null);
  const [pickingPoint, setPickingPoint] = useState<"origin" | "destination" | null>(null);
  const [routePlan, setRoutePlan] = useState<RoutePlanResponse | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [routeFitRequest, setRouteFitRequest] = useState(0);
  const [focusedVehicleId, setFocusedVehicleId] = useState<number | null>(null);
  const [openSelectedRouteDetails, setOpenSelectedRouteDetails] = useState(false);

  const [timeOption, setTimeOption] = useState<TimeOption>("now");
  const [selectedDateTime, setSelectedDateTime] = useState(() => toLocalDateTimeString(new Date()));
  const userLocation = useUserLocation();

  /* ── Mobile tab navigation ─────────────────────────────── */
  const [mobileTab, setMobileTab] = useState<MobileTab>("map");
  const [showMobileLayers, setShowMobileLayers] = useState(false);
  const mobileLayersMenuRef = useRef<HTMLDivElement | null>(null);
  const isDesktop = useIsDesktop();

  /* ── Snapshot restore ──────────────────────────────────── */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("trip") !== "1") return;

    try {
      const raw = localStorage.getItem(ROUTE_SNAPSHOT_KEY);
      if (!raw) return;
      const snapshot = JSON.parse(raw) as StoredRouteSnapshot;
      const isFresh = snapshot?.savedAt && Date.now() - snapshot.savedAt <= SNAPSHOT_MAX_AGE_MS;
      const hasLegs = Array.isArray(snapshot?.route?.legs);
      if (!isFresh || !hasLegs) return;

      setShowPlanner(true);
      setRoutePlan({ routes: [snapshot.route] } as RoutePlanResponse);
      setSelectedRouteIndex(0);
      setOpenSelectedRouteDetails(true);
      setMobileTab("directions");
    } catch {
      // Ignore malformed snapshot.
    } finally {
      params.delete("trip");
      const next = params.toString();
      const nextUrl = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`;
      window.history.replaceState({}, "", nextUrl);
    }
  }, []);

  /* ── Stale map recovery ────────────────────────────────── */
  const [mapKey, setMapKey] = useState(0);
  useEffect(() => {
    const STALE_MS = 5 * 60 * 1000;
    let hiddenAt: number | null = null;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
      } else if (hiddenAt !== null && Date.now() - hiddenAt > STALE_MS) {
        setMapKey((k) => k + 1);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

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
      setFocusedVehicleId((prev) => (prev === vehicleId ? null : vehicleId));
      const v = vehicles.find((v) => v.id === vehicleId);
      if (v) {
        setSelectedLine({ lineNumber: v.lineNumber, type: v.transportType });
      }
    },
    [vehicles],
  );

  const handleDeselectVehicle = useCallback(() => {
    setFocusedVehicleId(null);
    setSelectedLine(null);
    if (vehiclesBeforeLocateRef.current !== null) {
      setShowVehicles(vehiclesBeforeLocateRef.current);
      vehiclesBeforeLocateRef.current = null;
    }
  }, []);

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
  }, [origin, destination, timeOption, selectedDateTime]);

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
    [origin, destination, planRouteIfReady],
  );

  const handleSwap = useCallback(() => {
    setOrigin(destination);
    setDestination(origin);
    planRouteIfReady(destination, origin);
  }, [origin, destination, planRouteIfReady]);

  const handleLocateVehicle = useCallback((leg: RouteLeg) => {
    if (leg.mode && leg.mode !== "WALK") {
      vehiclesBeforeLocateRef.current = showVehiclesRef.current;
      setSelectedLine({
        lineNumber: leg.lineNumber || "",
        type: leg.mode.toLowerCase(),
      });
      setShowVehicles(true);
    }
  }, []);

  const handleToggleVehicles = useCallback(() => {
    vehiclesBeforeLocateRef.current = null;
    setShowVehicles((v) => !v);
  }, []);

  const handleClearPlanner = useCallback(() => {
    setOrigin(null);
    setDestination(null);
    setPickingPoint(null);
    setRoutePlan(null);
    setPlanLoading(false);
    setSelectedRouteIndex(0);
    setSelectedLine(null);
    setSelectedStop(null);
    setFocusedVehicleId(null);
    setTimeOption("now");
    setSelectedDateTime(toLocalDateTimeString(new Date()));
    hasPlanSearchedRef.current = false;
    vehiclesBeforeLocateRef.current = null;
  }, []);

  const handleStopSelect = useCallback((stop: StopDto | null) => {
    setSelectedStop(stop);
    if (stop) {
      setSelectedLine(null);
    }
  }, []);

  const handleSetOrigin = useCallback(
    (place: { lat: number; lng: number; name?: string }) => {
      setOrigin(place);
      planRouteIfReady(place, destination);
    },
    [destination, planRouteIfReady],
  );

  const handleSetDestination = useCallback(
    (place: { lat: number; lng: number; name?: string }) => {
      setDestination(place);
      planRouteIfReady(origin, place);
    },
    [origin, planRouteIfReady],
  );

  /* ── Mobile tab handlers ───────────────────────────────── */
  const handleTabChange = useCallback((tab: MobileTab) => {
    if (tab === "layers") {
      setShowMobileLayers((open) => !open);
      return;
    }
    setShowMobileLayers(false);
    setMobileTab(tab);
    if (tab === "directions") {
      setShowPlanner(true);
    }
  }, []);

  /** Select a stop from Nearby or Search panels → switch to map. */
  const handleMobileStopSelect = useCallback((stop: StopDto) => {
    setSelectedStop(stop);
    setSelectedLine(null);
    setMobileTab("map");
  }, []);

  /** Select a line from Search panel → switch to map and show vehicles. */
  const handleMobileLineSelect = useCallback(
    (line: { lineNumber: string; type: string } | null) => {
      setSelectedLine(line);
      setSelectedStop(null);
      if (line) setShowVehicles(true);
      setMobileTab("map");
    },
    [],
  );

  const handlePlannerClose = useCallback(() => {
    setShowPlanner(false);
    if (!isDesktop) setMobileTab("map");
  }, [isDesktop]);

  useEffect(() => {
    if (showMobileLayers) return;
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      mobileLayersMenuRef.current?.contains(active)
    ) {
      active.blur();
    }
  }, [showMobileLayers]);

  const handleRouteSelect = useCallback((index: number) => {
    setSelectedRouteIndex(index);
    setRouteFitRequest((n) => n + 1);
  }, []);

  const layerButtons = [
    {
      key: "vehicles",
      label: "Vehicles",
      enabled: showVehicles,
      onClick: handleToggleVehicles,
      icon: Bus,
    },
    {
      key: "traffic",
      label: "Traffic",
      enabled: showTraffic,
      onClick: () => setShowTraffic((t) => !t),
      icon: Car,
    },
    {
      key: "stops",
      label: "Stops",
      enabled: showStops,
      onClick: () => setShowStops((s) => !s),
      icon: MapPin,
    },
  ] as const;

  /* ── Planner visibility ────────────────────────────────── */
  const showPlannerComponent = isDesktop ? showPlanner : mobileTab === "directions";

  /* ── Render ────────────────────────────────────────────── */
  return (
    <div className="h-dvh flex flex-col">
      {/* Desktop filter panel (mobile search removed — now in Search tab) */}
      <FilterPanel
        selectedLine={selectedLine}
        onLineSelect={setSelectedLine}
        selectedStop={selectedStop}
        onStopSelect={handleStopSelect}
        vehicleCount={vehicles.length}
        onTogglePlanner={() => setShowPlanner((p) => !p)}
        showTraffic={showTraffic}
        onToggleTraffic={() => setShowTraffic((t) => !t)}
        showVehicles={showVehicles}
        onToggleVehicles={handleToggleVehicles}
        showStops={showStops}
        onToggleStops={() => setShowStops((s) => !s)}
        lines={lines}
      />

      <div className="flex-1 flex relative overflow-hidden">
        {/* Route planner (desktop sidebar + mobile fullscreen via tab) */}
        {showPlannerComponent && (
          <RoutePlanner
            userLocation={userLocation}
            origin={origin}
            destination={destination}
            pickingPoint={pickingPoint}
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
            routePlan={routePlan}
            planLoading={planLoading}
            selectedRouteIndex={selectedRouteIndex}
            onSelectRoute={handleRouteSelect}
            onClose={handlePlannerClose}
            onLocateVehicle={handleLocateVehicle}
            timeOption={timeOption}
            onTimeOptionChange={setTimeOption}
            selectedDateTime={selectedDateTime}
            onDateTimeChange={setSelectedDateTime}
            onSwap={handleSwap}
            onClear={handleClearPlanner}
            openSelectedRouteDetails={openSelectedRouteDetails}
            onConsumeOpenSelectedRouteDetails={() => setOpenSelectedRouteDetails(false)}
          />
        )}

        <div className="flex-1 relative">
          {loading && <LoadingOverlay />}
          <MapView
            key={mapKey}
            vehicles={vehicles}
            routePlan={routePlan}
            selectedRouteIndex={selectedRouteIndex}
            origin={origin}
            destination={destination}
            pickingPoint={pickingPoint}
            onMapClick={handleMapClick}
            focusedVehicleId={focusedVehicleId}
            routeFitRequest={routeFitRequest}
            shapes={shapes}
            onVehicleClick={handleVehicleClick}
            onDeselectVehicle={handleDeselectVehicle}
            selectedStop={selectedStop}
            showTraffic={showTraffic}
            showStops={showStops}
          />

          {/* ── Mobile: Nearby panel (draggable sheet) ──────── */}
          {!isDesktop && (
            <BottomSheet open={mobileTab === "nearby"} onClose={() => setMobileTab("map")}>
              <QuickActionsPanel onStopSelect={handleMobileStopSelect} />
            </BottomSheet>
          )}

          {/* ── Mobile: Search panel (full-screen) ─────────── */}
          {!isDesktop && mobileTab === "search" && (
            <div className="absolute inset-0 z-[1100] bg-white">
              <MobileSearchView
                lines={lines}
                selectedLine={selectedLine}
                onLineSelect={handleMobileLineSelect}
                selectedStop={selectedStop}
                onStopSelect={(stop) => {
                  if (stop) handleMobileStopSelect(stop);
                }}
                vehicleCount={vehicles.length}
                onClose={() => setMobileTab("map")}
              />
            </div>
          )}

          {!isDesktop && (
            <div className="absolute bottom-20 right-2 z-[1150] pointer-events-none">
              <div
                ref={mobileLayersMenuRef}
                className={`flex flex-col items-end gap-2 transition-all duration-200 ${
                  showMobileLayers
                    ? "opacity-100 translate-y-0 scale-100"
                    : "opacity-0 translate-y-2 scale-95"
                }`}
              >
                {layerButtons.map(({ key, label, enabled, onClick, icon: IconComp }) => (
                  <button
                    key={key}
                    onClick={() => {
                      onClick();
                      setShowMobileLayers(false);
                    }}
                    className={`pointer-events-auto h-10 min-w-[102px] px-2 rounded-xl border flex items-center justify-center gap-1.5 text-sm font-semibold shadow-lg transition-colors ${
                      enabled
                        ? "border-primary bg-primary text-white shadow-primary/25"
                        : "border-foreground/10 bg-white/95 text-foreground/75 backdrop-blur-md"
                    }`}
                    tabIndex={showMobileLayers ? 0 : -1}
                  >
                    <span>{label}</span>
                    <IconComp className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile bottom navigation */}
      <BottomNavigation
        activeTab={mobileTab}
        layersOpen={showMobileLayers}
        onTabChange={handleTabChange}
      />
    </div>
  );
}
