"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { PlaceSearchInput } from "./place-search-input";
import { RouteLegCard } from "./route-leg-card";
import { formatDuration, formatTime } from "@/lib/format-utils";
import { MODE_COLORS } from "@/lib/constants";
import type { RoutePlanResponse, PlannedRoute, RouteLeg } from "@/lib/types";

export type TimeOption = "now" | "depart" | "arrive";

function getRouteTimeRange(route: PlannedRoute): { dep: string; arr: string } {
  let dep = "";
  let arr = "";
  for (const leg of route.legs) {
    if (leg.scheduledDeparture && !dep) dep = formatTime(leg.scheduledDeparture);
    if (leg.scheduledArrival) arr = formatTime(leg.scheduledArrival);
  }
  return { dep, arr };
}

function getFirstTransitDeparture(route: PlannedRoute): string | null {
  for (const leg of route.legs) {
    if (leg.mode !== "WALK" && leg.lineNumber) {
      const time = formatTime(leg.scheduledDeparture);
      if (time && leg.departureStop) {
        return `${time} from ${leg.departureStop}`;
      }
    }
  }
  return null;
}

function LegChain({ legs }: { legs: RouteLeg[] }) {
  const visibleLegs = legs.filter(
    (leg) => !(leg.mode === "WALK" && formatDuration(leg.duration) === "0 min")
  );

  return (
    <div className="flex items-center gap-0.5 flex-wrap">
      {visibleLegs.map((leg, i) => (
        <div key={i} className="flex items-center gap-0.5">
          {i > 0 && (
            <svg width="8" height="8" viewBox="0 0 8 8" className="text-muted-foreground mx-0.5 shrink-0">
              <path d="M2 0l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          )}
          {leg.mode === "WALK" ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground shrink-0">
              <circle cx="12" cy="5" r="2" />
              <path d="M10 22l2-7 3 3v6M10.5 11l2.5-3 3.5 2" />
            </svg>
          ) : (
            <Badge
              className="text-white text-[10px] px-1.5 py-0 h-5 font-semibold shrink-0"
              style={{ backgroundColor: MODE_COLORS[leg.mode] || "#999" }}
            >
              {leg.lineNumber || leg.mode}
            </Badge>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Shared sub-components for route list & detail ── */

function RouteInputs({
  origin,
  destination,
  onSetOrigin,
  onSetDestination,
  pickingPoint,
  onStartPicking,
  onSwap,
}: Pick<
  RoutePlannerProps,
  | "origin"
  | "destination"
  | "onSetOrigin"
  | "onSetDestination"
  | "pickingPoint"
  | "onStartPicking"
  | "onSwap"
>) {
  return (
    <div className="p-3 sm:p-4">
      <div className="flex items-stretch gap-1">
        <div className="flex flex-col items-center py-2 w-5 shrink-0">
          <div className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
          <div className="flex-1 w-px bg-muted-foreground/30 my-1" />
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
        </div>
        <div className="flex-1 space-y-1.5 min-w-0">
          <PlaceSearchInput
            label="origin"
            dotColor="transparent"
            value={origin}
            onSelect={onSetOrigin}
            pickingPoint={pickingPoint}
            pointType="origin"
            onStartPicking={onStartPicking}
          />
          <PlaceSearchInput
            label="destination"
            dotColor="transparent"
            value={destination}
            onSelect={onSetDestination}
            pickingPoint={pickingPoint}
            pointType="destination"
            onStartPicking={onStartPicking}
          />
        </div>
        <button
          onClick={onSwap}
          className="self-center ml-1 p-1.5 rounded-full hover:bg-accent transition-colors shrink-0"
          title="Swap origin and destination"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function TimeSelector({
  timeOption,
  onTimeOptionChange,
  selectedDateTime,
  onDateTimeChange,
}: Pick<RoutePlannerProps, "timeOption" | "onTimeOptionChange" | "selectedDateTime" | "onDateTimeChange">) {
  return (
    <div className="px-3 py-2 sm:px-4 flex items-center gap-2 flex-wrap">
      <select
        value={timeOption}
        onChange={(e) => onTimeOptionChange(e.target.value as TimeOption)}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="now">Leave now</option>
        <option value="depart">Depart at</option>
        <option value="arrive">Arrive by</option>
      </select>
      {timeOption !== "now" && (
        <input
          type="datetime-local"
          value={selectedDateTime}
          onChange={(e) => onDateTimeChange(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      )}
    </div>
  );
}

function RouteSummaryRow({
  route,
  index,
  isSelected,
  onClick,
}: {
  route: PlannedRoute;
  index: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { dep, arr } = getRouteTimeRange(route);
  const firstTransit = getFirstTransitDeparture(route);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 sm:px-4 transition-colors hover:bg-accent/50 ${
        isSelected ? "bg-green-500/15" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm">
            {dep && arr ? `${dep} — ${arr}` : dep || arr || "Route " + (index + 1)}
          </div>
          <div className="mt-1">
            <LegChain legs={route.legs} />
          </div>
          {firstTransit && (
            <div className="text-xs text-muted-foreground mt-1">
              {firstTransit}
            </div>
          )}
        </div>
        <div className="text-sm text-muted-foreground font-medium shrink-0">
          {formatDuration(route.duration)}
        </div>
      </div>
    </button>
  );
}

function ExpandedLegDetails({
  route,
  onLocateVehicle,
}: {
  route: PlannedRoute;
  onLocateVehicle: (leg: RouteLeg, legIndex: number) => void;
}) {
  return (
    <div className="px-3 pb-3 sm:px-4 space-y-2 bg-accent/10">
      {route.legs
        .map((leg, originalIndex) => ({ leg, originalIndex }))
        .filter(({ leg }) => !(leg.mode === "WALK" && formatDuration(leg.duration) === "0 min"))
        .map(({ leg, originalIndex }) => (
          <RouteLegCard
            key={originalIndex}
            leg={leg}
            legIndex={originalIndex}
            onLocateVehicle={onLocateVehicle}
          />
        ))}
    </div>
  );
}

/* ── Main component ── */

interface RoutePlannerProps {
  origin: { lat: number; lng: number; name?: string } | null;
  destination: { lat: number; lng: number; name?: string } | null;
  pickingPoint: "origin" | "destination" | null;
  onStartPicking: (point: "origin" | "destination" | null) => void;
  onSetOrigin: (place: { lat: number; lng: number; name: string }) => void;
  onSetDestination: (place: { lat: number; lng: number; name: string }) => void;
  onPlanRoute: () => void;
  routePlan: RoutePlanResponse | null;
  planLoading: boolean;
  selectedRouteIndex: number;
  onSelectRoute: (index: number) => void;
  onClose: () => void;
  onLocateVehicle: (leg: RouteLeg, legIndex: number) => void;
  timeOption: TimeOption;
  onTimeOptionChange: (opt: TimeOption) => void;
  selectedDateTime: string;
  onDateTimeChange: (dt: string) => void;
  onSwap: () => void;
  onClear?: () => void;
}

export function RoutePlanner({
  origin,
  destination,
  pickingPoint,
  onStartPicking,
  onSetOrigin,
  onSetDestination,
  onPlanRoute,
  routePlan,
  planLoading,
  selectedRouteIndex,
  onSelectRoute,
  onClose,
  onLocateVehicle,
  timeOption,
  onTimeOptionChange,
  selectedDateTime,
  onDateTimeChange,
  onSwap,
  onClear,
}: RoutePlannerProps) {
  const [expandedRoute, setExpandedRoute] = useState<number | null>(null);

  const hasRoutes = routePlan && routePlan.routes && routePlan.routes.length > 0;

  // On mobile: route picked = folded mode (expandedRoute !== null)
  const mobileFollded = expandedRoute !== null;

  const handleRouteClick = (index: number) => {
    onSelectRoute(index);
    setExpandedRoute((prev) => (prev === index ? null : index));
  };

  const handleBackToList = () => {
    setExpandedRoute(null);
  };

  /* ── Desktop content (unchanged — always shows everything in side panel) ── */
  const desktopContent = (
    <>
      <RouteInputs
        origin={origin}
        destination={destination}
        onSetOrigin={onSetOrigin}
        onSetDestination={onSetDestination}
        pickingPoint={pickingPoint}
        onStartPicking={onStartPicking}
        onSwap={onSwap}
      />
      <Separator />
      <TimeSelector
        timeOption={timeOption}
        onTimeOptionChange={onTimeOptionChange}
        selectedDateTime={selectedDateTime}
        onDateTimeChange={onDateTimeChange}
      />
      <Separator />
      <div className="px-3 py-2 sm:px-4">
        <Button className="w-full" disabled={!origin || !destination || planLoading} onClick={onPlanRoute}>
          {planLoading ? (
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              Planning...
            </span>
          ) : (
            "Plan Route"
          )}
        </Button>
      </div>
      {hasRoutes && (
        <ScrollArea className="flex-1 min-h-0">
          <div className="divide-y divide-border">
            {routePlan.routes.map((route, i) => {
              const isExpanded = expandedRoute === i;
              return (
                <div key={i}>
                  <RouteSummaryRow
                    route={route}
                    index={i}
                    isSelected={i === selectedRouteIndex}
                    onClick={() => handleRouteClick(i)}
                  />
                  {isExpanded && (
                    <ExpandedLegDetails route={route} onLocateVehicle={onLocateVehicle} />
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
      {routePlan && routePlan.routes && routePlan.routes.length === 0 && !planLoading && (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
          No transit routes found.
        </div>
      )}
    </>
  );

  /* ── Mobile: full-screen content (inputs + results list) ── */
  const mobileFullContent = (
    <>
      <RouteInputs
        origin={origin}
        destination={destination}
        onSetOrigin={onSetOrigin}
        onSetDestination={onSetDestination}
        pickingPoint={pickingPoint}
        onStartPicking={onStartPicking}
        onSwap={onSwap}
      />
      <Separator />
      <TimeSelector
        timeOption={timeOption}
        onTimeOptionChange={onTimeOptionChange}
        selectedDateTime={selectedDateTime}
        onDateTimeChange={onDateTimeChange}
      />
      <Separator />
      <div className="px-3 py-2">
        <Button className="w-full" disabled={!origin || !destination || planLoading} onClick={onPlanRoute}>
          {planLoading ? (
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              Planning...
            </span>
          ) : (
            "Plan Route"
          )}
        </Button>
      </div>
      {hasRoutes && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="divide-y divide-border">
            {routePlan.routes.map((route, i) => (
              <RouteSummaryRow
                key={i}
                route={route}
                index={i}
                isSelected={i === selectedRouteIndex}
                onClick={() => handleRouteClick(i)}
              />
            ))}
          </div>
        </div>
      )}
      {routePlan && routePlan.routes && routePlan.routes.length === 0 && !planLoading && (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
          No transit routes found.
        </div>
      )}
    </>
  );

  /* ── Mobile: folded content (selected route detail) ── */
  const selectedRoute = hasRoutes ? routePlan.routes[expandedRoute ?? 0] : null;
  const mobileFoldedContent = selectedRoute ? (
    <>
      {/* Back button + route summary header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <button
          onClick={handleBackToList}
          className="p-1 rounded-full hover:bg-accent transition-colors shrink-0"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          {(() => {
            const { dep, arr } = getRouteTimeRange(selectedRoute);
            return (
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm truncate">
                  {dep && arr ? `${dep} — ${arr}` : "Route details"}
                </span>
                <span className="text-sm text-muted-foreground font-medium shrink-0">
                  {formatDuration(selectedRoute.duration)}
                </span>
              </div>
            );
          })()}
          <div className="mt-0.5">
            <LegChain legs={selectedRoute.legs} />
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          &times;
        </Button>
      </div>
      {/* Leg details */}
      <div className="overflow-y-auto max-h-[40vh]">
        <ExpandedLegDetails route={selectedRoute} onLocateVehicle={onLocateVehicle} />
      </div>
    </>
  ) : null;

  return (
    <>
      {/* Desktop: side panel */}
      <div className="hidden md:flex w-80 border-r border-border bg-card flex-col shrink-0">
        <div className="flex items-center justify-between px-4 py-3">
            <h2 className="font-semibold">Route Planner</h2>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-7" onClick={() => onClear && onClear()}>
                Clear
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
                &times;
              </Button>
            </div>
        </div>
        <Separator />
        {desktopContent}
      </div>

      {/* Mobile: full-screen or folded bottom sheet */}
      {!mobileFollded ? (
        /* Full-screen: covers entire map area */
        <div className="md:hidden absolute inset-0 z-[1000] flex flex-col bg-card">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
            <h2 className="font-semibold text-sm">Route Planner</h2>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-7" onClick={() => onClear && onClear()}>
                  Clear
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={onClose}
                >
                  &times;
                </Button>
              </div>
          </div>
          <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
            {mobileFullContent}
          </div>
        </div>
      ) : (
        /* Folded: bottom sheet showing selected route details */
        <div className="md:hidden absolute bottom-0 left-0 right-0 z-[1000] flex flex-col bg-card border-t border-border rounded-t-xl shadow-2xl">
          {mobileFoldedContent}
        </div>
      )}
    </>
  );
}
