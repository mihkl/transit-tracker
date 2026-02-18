"use client";

import { useState, useCallback, useRef } from "react";
import { FilterPanel } from "@/components/filter-panel";
import { MapView } from "@/components/map-view";
import { RoutePlanner, type TimeOption } from "@/components/route-planner";
import { LoadingOverlay } from "@/components/loading-overlay";
import { Car } from "lucide-react";
import { Icon } from "@/components/icon";
import { useVehicleStream } from "@/hooks/use-vehicle-stream";
import { useAnimatedVehicles } from "@/hooks/use-animated-vehicles";
import type {
  RoutePlanResponse,
  RouteLeg,
  LineDto,
  StopDto,
} from "@/lib/types";

type ShapesMap = Record<string, number[][]>;

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

  const [timeOption, setTimeOption] = useState<TimeOption>("now");
  const [selectedDateTime, setSelectedDateTime] = useState(() =>
    toLocalDateTimeString(new Date()),
  );

  const pickingFromPlannerRef = useRef(false);
  const hasPlanSearchedRef = useRef(false);

  const lineFilter = selectedLine?.lineNumber ?? "";
  const typeFilter = selectedLine?.type ?? "all";

  const { vehicles: rawVehicles, loading } = useVehicleStream(
    lineFilter,
    typeFilter,
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
  }, []);

  const handlePlanRoute = useCallback(async () => {
    if (!origin || !destination) return;
    setPlanLoading(true);
    setRoutePlan(null);
    setSelectedRouteIndex(0);
    setSelectedLine(null);
    setSelectedStop(null);
    try {
      const body: Record<string, unknown> = {
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
        body.departureTime = dt.toISOString();
      } else if (timeOption === "arrive" && selectedDateTime) {
        body.arrivalTime = new Date(selectedDateTime).toISOString();
      }

      const res = await fetch("/api/routes/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        console.error("Route plan API error:", data.error || res.statusText);
        setRoutePlan({ routes: [] });
      } else {
        setRoutePlan(data);
      }
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
      setSelectedLine({
        lineNumber: leg.lineNumber || "",
        type: leg.mode.toLowerCase(),
      });
    }
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
        lines={lines}
      />
      <div className="flex-1 flex relative overflow-hidden">
        {showPlanner && (
          <RoutePlanner
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
          />
        )}
        <div className="flex-1 relative">
          {loading && <LoadingOverlay />}
          <MapView
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
