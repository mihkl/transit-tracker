"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { FilterPanel } from "@/components/filter-panel";
import { MapView } from "@/components/map-view";
import { RoutePlanner, type TimeOption } from "@/components/route-planner";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useVehicleStream } from "@/hooks/use-vehicle-stream";
import { useAnimatedVehicles } from "@/hooks/use-animated-vehicles";
import type { RoutePlanResponse, RouteLeg } from "@/lib/types";
import type { StopDto } from "@/app/api/all-stops/route";

type ShapesMap = Record<string, number[][]>;

function toLocalDateTimeString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function Home() {
  const [selectedLine, setSelectedLine] = useState<{
    lineNumber: string;
    type: string;
  } | null>(null);
  const [selectedStop, setSelectedStop] = useState<StopDto | null>(null);
  const [shapes, setShapes] = useState<ShapesMap | null>(null);

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

  const lineFilter = selectedLine?.lineNumber ?? "";
  const typeFilter = selectedLine?.type ?? "all";

  const {
    vehicles: rawVehicles,
    lastUpdate,
    loading,
  } = useVehicleStream(lineFilter, typeFilter);

  useEffect(() => {
    fetch("/api/shapes")
      .then((r) => r.json())
      .then(setShapes)
      .catch((err) => console.error("Failed to load shapes:", err));
  }, []);

  const vehicles = useAnimatedVehicles(rawVehicles, shapes);

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

  const handleMapClick = useCallback(
    (pointType: string, lat: number, lng: number) => {
      if (pointType === "origin") {
        setOrigin({ lat, lng });
      } else if (pointType === "destination") {
        setDestination({ lat, lng });
      }
      setPickingPoint(null);
      if (pickingFromPlannerRef.current) {
        pickingFromPlannerRef.current = false;
        setShowPlanner(true);
      }
    },
    [],
  );

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
    }
  }, [origin, destination, timeOption, selectedDateTime]);

  const autoSearchRef = useRef(false);
  useEffect(() => {
    if (origin && destination && showPlanner) {
      if (autoSearchRef.current) {
        handlePlanRoute();
      }
      autoSearchRef.current = true;
    }
  }, [origin, destination, handlePlanRoute, showPlanner]);

  const handleSwap = useCallback(() => {
    const prevOrigin = origin;
    const prevDest = destination;
    setOrigin(prevDest);
    setDestination(prevOrigin);
  }, [origin, destination]);

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
  }, []);

  const handleStopSelect = useCallback((stop: StopDto | null) => {
    setSelectedStop(stop);
    if (stop) {
      setSelectedLine(null);
    }
  }, []);

  return (
    <div className="h-dvh flex flex-col">
      <FilterPanel
        selectedLine={selectedLine}
        onLineSelect={setSelectedLine}
        selectedStop={selectedStop}
        onStopSelect={handleStopSelect}
        vehicleCount={vehicles.length}
        lastUpdate={lastUpdate}
        showPlanner={showPlanner}
        onTogglePlanner={() => setShowPlanner((p) => !p)}
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
            onSetOrigin={setOrigin}
            onSetDestination={setDestination}
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
          />
        </div>
      </div>
    </div>
  );
}
