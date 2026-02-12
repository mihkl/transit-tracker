"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { FilterPanel } from "@/components/filter-panel";
import { MapView } from "@/components/map-view";
import { RoutePlanner, type TimeOption } from "@/components/route-planner";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useVehicleStream } from "@/hooks/use-vehicle-stream";
import { useAnimatedVehicles } from "@/hooks/use-animated-vehicles";
import type { RoutePlanResponse, RouteLeg } from "@/lib/types";

type ShapesMap = Record<string, number[][]>;

// Build the /api/find-vehicle URL for a transit leg
function buildFindVehicleUrl(leg: RouteLeg): string | null {
  if (!leg.lineNumber || leg.departureStopLat == null || leg.departureStopLng == null) {
    return null;
  }
  const params = new URLSearchParams({ line: leg.lineNumber });
  params.set("depLat", String(leg.departureStopLat));
  params.set("depLng", String(leg.departureStopLng));
  if (leg.arrivalStopLat != null) params.set("arrLat", String(leg.arrivalStopLat));
  if (leg.arrivalStopLng != null) params.set("arrLng", String(leg.arrivalStopLng));
  if (leg.mode) params.set("mode", leg.mode);
  if (leg.scheduledDeparture) params.set("scheduledDep", leg.scheduledDeparture);
  return `/api/find-vehicle?${params}`;
}

function toLocalDateTimeString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function Home() {
  const [selectedLine, setSelectedLine] = useState<{
    lineNumber: string;
    type: string;
  } | null>(null);
  const [shapes, setShapes] = useState<ShapesMap | null>(null);

  // Route planner state
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
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);

  // Time selector state
  const [timeOption, setTimeOption] = useState<TimeOption>("now");
  const [selectedDateTime, setSelectedDateTime] = useState(() =>
    toLocalDateTimeString(new Date())
  );

  // Pre-fetched vehicle IDs for each transit leg: "routeIdx_legIdx" → vehicleId
  const [legVehicleIds, setLegVehicleIds] = useState<Record<string, number>>({});
  const prefetchVersionRef = useRef(0);
  // Track whether picking was initiated from the route planner so we can
  // temporarily hide the planner (show the map) and restore it after picking.
  const pickingFromPlannerRef = useRef(false);

  // Derive filter values for SSE stream
  const lineFilter = selectedLine?.lineNumber ?? "";
  const typeFilter = selectedLine?.type ?? "all";

  // SSE vehicle stream
  const {
    vehicles: rawVehicles,
    lastUpdate,
    loading,
  } = useVehicleStream(lineFilter, typeFilter);

  // Load shapes once
  useEffect(() => {
    fetch("/api/shapes")
      .then((r) => r.json())
      .then(setShapes)
      .catch((err) => console.error("Failed to load shapes:", err));
  }, []);

  // Animated vehicles
  const vehicles = useAnimatedVehicles(rawVehicles, shapes);

  // Pre-fetch vehicle IDs for all transit legs when route plan changes
  useEffect(() => {
    if (!routePlan || !routePlan.routes || routePlan.routes.length === 0) {
      setLegVehicleIds({});
      return;
    }

    const version = ++prefetchVersionRef.current;
    const results: Record<string, number> = {};

    const fetches: Promise<void>[] = [];

    for (let ri = 0; ri < routePlan.routes.length; ri++) {
      const route = routePlan.routes[ri];
      for (let li = 0; li < route.legs.length; li++) {
        const leg = route.legs[li];
        if (leg.mode === "WALK" || !leg.lineNumber) continue;

        const url = buildFindVehicleUrl(leg);
        if (!url) continue;

        const key = `${ri}_${li}`;
        fetches.push(
          fetch(url)
            .then((r) => r.json())
            .then((data) => {
              if (data.vehicleId != null) {
                results[key] = data.vehicleId;
              }
            })
            .catch(() => {})
        );
      }
    }

    Promise.all(fetches).then(() => {
      if (prefetchVersionRef.current === version) {
        setLegVehicleIds(results);
      }
    });
  }, [routePlan]);

  const handleVehicleClick = useCallback(
    (vehicleId: number) => {
      setSelectedVehicleId((prev) =>
        prev === vehicleId ? null : vehicleId
      );
    },
    []
  );

  const handleDeselectVehicle = useCallback(() => {
    setSelectedVehicleId(null);
  }, []);

  const handleMapClick = useCallback(
    (pointType: string, lat: number, lng: number) => {
      if (pointType === "origin") {
        setOrigin({ lat, lng });
      } else if (pointType === "destination") {
        setDestination({ lat, lng });
      }
      // clear picking state
      setPickingPoint(null);
      // if we opened the map for picking from the planner, return to planner view
      if (pickingFromPlannerRef.current) {
        pickingFromPlannerRef.current = false;
        setShowPlanner(true);
      }
    },
    []
  );

  const handlePlanRoute = useCallback(async () => {
    if (!origin || !destination) return;
    setPlanLoading(true);
    setRoutePlan(null);
    setLegVehicleIds({});
    setSelectedRouteIndex(0);
    setSelectedLine(null);
    try {
      const body: Record<string, unknown> = {
        originLat: origin.lat,
        originLng: origin.lng,
        destinationLat: destination.lat,
        destinationLng: destination.lng,
      };

      if ((timeOption === "depart" && selectedDateTime) || timeOption === "now") {
        // For 'now' treat as an explicit departure time so behavior matches 'Depart at'
        // Use current time when 'now', otherwise use selectedDateTime.
        const dt = timeOption === "now" ? new Date() : new Date(selectedDateTime);
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
      setRoutePlan(data);
    } catch (err) {
      console.error("Failed to plan route:", err);
    } finally {
      setPlanLoading(false);
    }
  }, [origin, destination, timeOption, selectedDateTime]);

  // Auto-trigger route planning when both origin & destination are set
  const autoSearchRef = useRef(false);
  useEffect(() => {
    if (origin && destination && showPlanner) {
      // Skip the very first render — only auto-search when a value actually changes
      if (autoSearchRef.current) {
        handlePlanRoute();
      }
      autoSearchRef.current = true;
    }
  }, [origin, destination]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSwap = useCallback(() => {
    const prevOrigin = origin;
    const prevDest = destination;
    setOrigin(prevDest);
    setDestination(prevOrigin);
  }, [origin, destination]);

  const handleLocateVehicle = useCallback(
    (leg: RouteLeg, legIndex: number) => {
      // Set filter to this vehicle's type so the SSE stream includes it
      if (leg.mode && leg.mode !== "WALK") {
        setSelectedLine({
          lineNumber: leg.lineNumber || "",
          type: leg.mode.toLowerCase(),
        });
      }

      const key = `${selectedRouteIndex}_${legIndex}`;
      const vehicleId = legVehicleIds[key];
      if (vehicleId != null) {
        setSelectedVehicleId(vehicleId);
        setFocusedVehicleId(null);
        setTimeout(() => setFocusedVehicleId(vehicleId), 0);
        return;
      }

      const url = buildFindVehicleUrl(leg);
      if (!url) return;
      fetch(url)
        .then((r) => r.json())
        .then((data) => {
          if (data.vehicleId != null) {
            setSelectedVehicleId(data.vehicleId);
            setFocusedVehicleId(null);
            setTimeout(() => setFocusedVehicleId(data.vehicleId), 0);
          }
        })
        .catch((err) => console.error("Failed to find vehicle:", err));
    },
    [selectedRouteIndex, legVehicleIds]
  );
  const handleClearPlanner = useCallback(() => {
    setOrigin(null);
    setDestination(null);
    setPickingPoint(null);
    setRoutePlan(null);
    setPlanLoading(false);
    setSelectedRouteIndex(0);
    setSelectedLine(null);
    setLegVehicleIds({});
    setSelectedVehicleId(null);
    setFocusedVehicleId(null);
    setTimeOption("now");
    setSelectedDateTime(toLocalDateTimeString(new Date()));
  }, []);

  return (
    <div className="h-dvh flex flex-col">
      <FilterPanel
        selectedLine={selectedLine}
        onLineSelect={setSelectedLine}
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
                // Only hide the planner on small screens (mobile). On desktop the
                // planner sits next to the map so no need to hide it.
                const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
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
            selectedVehicleId={selectedVehicleId}
            shapes={shapes}
            onVehicleClick={handleVehicleClick}
            onDeselectVehicle={handleDeselectVehicle}
            showPlanner={showPlanner}
          />
        </div>
      </div>
    </div>
  );
}
