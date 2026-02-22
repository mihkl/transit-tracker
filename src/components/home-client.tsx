"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { FilterPanel } from "@/components/filter-panel";
import { MapView } from "@/components/map-view";
import { RoutePlanner, type TimeOption } from "@/components/route-planner";
import { LoadingOverlay } from "@/components/loading-overlay";
import { Car, Bus } from "lucide-react";
import { Icon } from "@/components/icon";
import { useVehicleStream } from "@/hooks/use-vehicle-stream";
import { useAnimatedVehicles } from "@/hooks/use-animated-vehicles";
import { isReliableUserLocation } from "@/lib/location-quality";
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
  const [selectedLine, setSelectedLine] = useState<{
    lineNumber: string;
    type: string;
  } | null>(null);
  const [selectedStop, setSelectedStop] = useState<StopDto | null>(null);
  const [showTraffic, setShowTraffic] = useState(false);
  const [showVehicles, setShowVehicles] = useState(false);

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
  const [pickingPoint, setPickingPoint] = useState<
    "origin" | "destination" | null
  >(null);
  const [routePlan, setRoutePlan] = useState<RoutePlanResponse | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [focusedVehicleId, setFocusedVehicleId] = useState<number | null>(null);
  const [openSelectedRouteDetails, setOpenSelectedRouteDetails] =
    useState(false);

  const [timeOption, setTimeOption] = useState<TimeOption>("now");
  const [selectedDateTime, setSelectedDateTime] = useState(() =>
    toLocalDateTimeString(new Date()),
  );
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("trip") !== "1") return;

    try {
      const raw = localStorage.getItem(ROUTE_SNAPSHOT_KEY);
      if (!raw) return;
      const snapshot = JSON.parse(raw) as StoredRouteSnapshot;
      const isFresh =
        snapshot?.savedAt && Date.now() - snapshot.savedAt <= SNAPSHOT_MAX_AGE_MS;
      const hasLegs = Array.isArray(snapshot?.route?.legs);
      if (!isFresh || !hasLegs) return;

      setShowPlanner(true);
      setRoutePlan({ routes: [snapshot.route] } as RoutePlanResponse);
      setSelectedRouteIndex(0);
      setOpenSelectedRouteDetails(true);
    } catch {
      // Ignore malformed snapshot.
    } finally {
      params.delete("trip");
      const next = params.toString();
      const nextUrl = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`;
      window.history.replaceState({}, "", nextUrl);
    }
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        if (!isReliableUserLocation(coords)) return;
        setUserLocation({ lat: coords.latitude, lng: coords.longitude });
      },
      (err) => console.warn("Geolocation error:", err.message),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

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
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const pickingFromPlannerRef = useRef(false);
  const hasPlanSearchedRef = useRef(false);
  // Tracks showVehicles state before a "locate vehicle" action so we can
  // restore it when the user dismisses (clicks the map).
  const vehiclesBeforeLocateRef = useRef<boolean | null>(null);
  // Always-current ref so callbacks don't need showVehicles in their deps.
  const showVehiclesRef = useRef(showVehicles);
  showVehiclesRef.current = showVehicles;

  const lineFilter = selectedLine?.lineNumber ?? "";
  const typeFilter = selectedLine?.type ?? "all";

  const { vehicles: rawVehicles, loading } = useVehicleStream(
    lineFilter,
    typeFilter,
    showVehicles,
  );

  const vehicles = useAnimatedVehicles(rawVehicles);

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

      if (
        (timeOption === "depart" && selectedDateTime) ||
        timeOption === "now"
      ) {
        const dt =
          timeOption === "now" ? new Date() : new Date(selectedDateTime);
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
      // Save current overlay state so we can restore it when the user dismisses.
      vehiclesBeforeLocateRef.current = showVehiclesRef.current;
      setSelectedLine({
        lineNumber: leg.lineNumber || "",
        type: leg.mode.toLowerCase(),
      });
      setShowVehicles(true);
    }
  }, []);

  const handleToggleVehicles = useCallback(() => {
    // A manual toggle cancels the pending "restore on dismiss" behaviour.
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

  return (
    <div className="h-dvh flex flex-col">
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
        lines={lines}
      />
      <div className="flex-1 flex relative overflow-hidden">
        {showPlanner && (
          <RoutePlanner
            userLocation={userLocation}
            origin={origin}
            destination={destination}
            pickingPoint={pickingPoint}
            onStartPicking={(pt) => {
              const isMobile =
                typeof window !== "undefined" && window.innerWidth < 768;
              if (pt && isMobile) {
                pickingFromPlannerRef.current = true;
                setShowPlanner(false);
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
            onSelectRoute={setSelectedRouteIndex}
            onClose={() => setShowPlanner(false)}
            onLocateVehicle={handleLocateVehicle}
            timeOption={timeOption}
            onTimeOptionChange={setTimeOption}
            selectedDateTime={selectedDateTime}
            onDateTimeChange={setSelectedDateTime}
            onSwap={handleSwap}
            onClear={handleClearPlanner}
            openSelectedRouteDetails={openSelectedRouteDetails}
            onConsumeOpenSelectedRouteDetails={() =>
              setOpenSelectedRouteDetails(false)
            }
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
            shapes={shapes}
            onVehicleClick={handleVehicleClick}
            onDeselectVehicle={handleDeselectVehicle}
            selectedStop={selectedStop}
            showTraffic={showTraffic}
          />

          {/* Mobile-only map overlay controls */}
          {!showPlanner && !pickingPoint && !focusedVehicleId && !selectedStop && (
            <div className="absolute bottom-6 right-3 flex flex-col gap-2 z-1000 md:hidden">
              <button
                onClick={handleToggleVehicles}
                className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-fab transition-all duration-150 active:scale-95 ${
                  showVehicles
                    ? "bg-foreground text-white"
                    : "bg-white text-foreground/50"
                }`}
                title="Toggle vehicles"
              >
                <Bus size={18} />
              </button>
              <button
                onClick={() => setShowTraffic((t) => !t)}
                className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-fab transition-all duration-150 active:scale-95 ${
                  showTraffic
                    ? "bg-foreground text-white"
                    : "bg-white text-foreground/50"
                }`}
                title="Toggle traffic"
              >
                <Car size={18} />
              </button>
              <button
                onClick={() => setShowPlanner(true)}
                className="w-11 h-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-fab transition-all duration-150 active:scale-95"
                title="Directions"
              >
                <Icon name="arrow-right" className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
