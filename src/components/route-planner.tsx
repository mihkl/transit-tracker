"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Footprints } from "lucide-react";
import { Icon } from "@/components/icon";
import { PlaceSearchInput } from "./place-search-input";
import { RouteLegCard } from "./route-leg-card";
import { formatDuration, formatTime } from "@/lib/format-utils";
import { getTransportColor } from "@/lib/constants";
import type { RoutePlanResponse, PlannedRoute, RouteLeg } from "@/lib/types";

export type TimeOption = "now" | "depart" | "arrive";

function getRouteTimeRange(route: PlannedRoute): {
  dep: string;
  arr: string;
  firstTransitDep: string;
  walkBefore: number;
} {
  let firstTransitDep = "";
  let firstTransitDepTime: Date | null = null;
  let arrTime: Date | null = null;
  let walkBeforeSeconds = 0;
  let walkAfterSeconds = 0;
  let foundFirstTransit = false;

  for (let i = 0; i < route.legs.length; i++) {
    const leg = route.legs[i];

    if (leg.mode === "WALK") {
      const durStr =
        typeof leg.duration === "string" ? leg.duration : String(leg.duration);
      const match = durStr.match(/(\d+)s/);
      if (match) {
        if (!foundFirstTransit) {
          walkBeforeSeconds += parseInt(match[1], 10);
        } else {
          walkAfterSeconds += parseInt(match[1], 10);
        }
      }
    } else {
      if (!foundFirstTransit) {
        foundFirstTransit = true;
        if (leg.scheduledDeparture) {
          firstTransitDep = formatTime(leg.scheduledDeparture);
          firstTransitDepTime = new Date(leg.scheduledDeparture);
        }
      }
      if (leg.scheduledArrival) {
        arrTime = new Date(leg.scheduledArrival);
      }
    }
  }

  let dep = firstTransitDep;
  let arr = arrTime ? formatTime(arrTime.toISOString()) : "";

  if (firstTransitDepTime && walkBeforeSeconds > 0) {
    const leaveTime = new Date(
      firstTransitDepTime.getTime() - walkBeforeSeconds * 1000,
    );
    dep = formatTime(leaveTime.toISOString());
  }

  if (arrTime && walkAfterSeconds > 0) {
    const finalArrTime = new Date(arrTime.getTime() + walkAfterSeconds * 1000);
    arr = formatTime(finalArrTime.toISOString());
  }

  const walkBefore = Math.round(walkBeforeSeconds / 60);
  return { dep, arr, firstTransitDep, walkBefore };
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
    (leg) => !(leg.mode === "WALK" && formatDuration(leg.duration) === "0 min"),
  );

  return (
    <div className="flex items-center gap-0.5 flex-wrap">
      {visibleLegs.map((leg, i) => (
        <div key={i} className="flex items-center gap-0.5">
          {i > 0 && (
            <Icon
              name="chevron-right-sm"
              size={8}
              className="text-gray-400 mx-0.5 shrink-0"
            />
          )}
          {leg.mode === "WALK" ? (
            <Footprints size={14} className="text-gray-500 shrink-0" />
          ) : (
            <Badge
              className="text-white text-[10px] px-1.5 py-0 h-5 font-semibold shrink-0 rounded"
              style={{ backgroundColor: getTransportColor(leg.mode) }}
            >
              {leg.lineNumber || leg.mode}
            </Badge>
          )}
        </div>
      ))}
    </div>
  );
}

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
      <div className="flex items-stretch gap-2">
        <div className="flex flex-col items-center py-2.5 w-5 shrink-0">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-blue-100 shrink-0" />
          <div className="flex-1 w-0.5 bg-gray-200 my-1" />
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-red-100 shrink-0" />
        </div>
        <div className="flex-1 space-y-2 min-w-0">
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
          className="self-center ml-1 p-2 rounded-full hover:bg-gray-100 transition-colors shrink-0 text-gray-500 hover:text-gray-700"
          title="Swap origin and destination"
        >
          <Icon name="swap" size={18} />
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
}: Pick<
  RoutePlannerProps,
  "timeOption" | "onTimeOptionChange" | "selectedDateTime" | "onDateTimeChange"
>) {
  return (
    <div className="px-3 py-2 sm:px-4 flex items-center gap-2 flex-wrap">
      <select
        value={timeOption}
        onChange={(e) => onTimeOptionChange(e.target.value as TimeOption)}
        className="h-8 rounded-md border border-gray-200 bg-white px-2.5 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
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
          className="h-8 rounded-md border border-gray-200 bg-white px-2.5 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
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
      className={`w-full text-left px-3 py-3 sm:px-4 transition-colors hover:bg-gray-50 ${
        isSelected ? "bg-blue-50 border-l-2 border-blue-500" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm text-gray-800">
            {dep && arr
              ? `${dep} — ${arr}`
              : dep || arr || "Route " + (index + 1)}
          </div>
          <div className="mt-1.5">
            <LegChain legs={route.legs} />
          </div>
          {firstTransit && (
            <div className="text-xs text-gray-500 mt-1.5">{firstTransit}</div>
          )}
        </div>
        <div className="text-sm text-gray-600 font-medium shrink-0 tabular-nums">
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
  onLocateVehicle: (leg: RouteLeg) => void;
}) {
  return (
    <div className="px-3 pb-3 sm:px-4 space-y-2 bg-gray-50">
      {route.legs
        .filter(
          (leg) =>
            !(leg.mode === "WALK" && formatDuration(leg.duration) === "0 min"),
        )
        .map((leg, i) => (
          <RouteLegCard key={i} leg={leg} onLocateVehicle={onLocateVehicle} />
        ))}
    </div>
  );
}

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
  onLocateVehicle: (leg: RouteLeg) => void;
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

  const hasRoutes =
    routePlan && routePlan.routes && routePlan.routes.length > 0;

  const mobileFollded = expandedRoute !== null;

  const handleRouteClick = (index: number) => {
    onSelectRoute(index);
    setExpandedRoute((prev) => (prev === index ? null : index));
  };

  const handleBackToList = () => {
    setExpandedRoute(null);
  };

  const plannerContent = (variant: "desktop" | "mobile") => {
    const isDesktop = variant === "desktop";
    return (
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
        <Separator className={isDesktop ? undefined : "bg-gray-100"} />
        <TimeSelector
          timeOption={timeOption}
          onTimeOptionChange={onTimeOptionChange}
          selectedDateTime={selectedDateTime}
          onDateTimeChange={onDateTimeChange}
        />
        <Separator className="bg-gray-100" />
        <div className="px-3 py-2 sm:px-4">
          <Button
            className="w-full bg-blue-500 hover:bg-blue-600 text-white"
            disabled={!origin || !destination || planLoading}
            onClick={onPlanRoute}
          >
            {planLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Planning...
              </span>
            ) : (
              "Get directions"
            )}
          </Button>
        </div>
        {hasRoutes &&
          (isDesktop ? (
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
                        <ExpandedLegDetails
                          route={route}
                          onLocateVehicle={onLocateVehicle}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="divide-y divide-gray-100">
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
          ))}
        {routePlan &&
          routePlan.routes &&
          routePlan.routes.length === 0 &&
          !planLoading && (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              No transit routes found.
            </div>
          )}
      </>
    );
  };

  const selectedRoute = hasRoutes ? routePlan.routes[expandedRoute ?? 0] : null;
  const mobileFoldedContent = selectedRoute ? (
    <>
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
        <button
          onClick={handleBackToList}
          className="p-1.5 rounded-full hover:bg-gray-100 transition-colors shrink-0 text-gray-500"
        >
          <Icon name="chevron-left" size={20} />
        </button>
        <div className="flex-1 min-w-0">
          {(() => {
            const { dep, arr } = getRouteTimeRange(selectedRoute);
            return (
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm text-gray-800 truncate">
                  {dep && arr ? `${dep} — ${arr}` : "Route details"}
                </span>
                <span className="text-sm text-gray-500 font-medium shrink-0 tabular-nums">
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
          className="h-7 w-7 p-0 shrink-0 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          &times;
        </Button>
      </div>
      <div className="overflow-y-auto max-h-[40vh]">
        <ExpandedLegDetails
          route={selectedRoute}
          onLocateVehicle={onLocateVehicle}
        />
      </div>
    </>
  ) : null;

  return (
    <>
      <div className="hidden md:flex w-80 border-r border-gray-200 bg-white flex-col shrink-0 shadow-[0_0_8px_rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="font-medium text-gray-800">Directions</h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              onClick={() => onClear && onClear()}
            >
              Clear
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              onClick={onClose}
            >
              &times;
            </Button>
          </div>
        </div>
        <Separator className="bg-gray-100" />
        {plannerContent("desktop")}
      </div>

      {!mobileFollded ? (
        <div className="md:hidden absolute inset-0 z-[1000] flex flex-col bg-white">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 shrink-0">
            <h2 className="font-medium text-gray-800 text-sm">Directions</h2>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-gray-500 hover:text-gray-700"
                onClick={() => onClear && onClear()}
              >
                Clear
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-gray-400 hover:text-gray-600"
                onClick={onClose}
              >
                &times;
              </Button>
            </div>
          </div>
          <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
            {plannerContent("mobile")}
          </div>
        </div>
      ) : (
        <div className="md:hidden absolute bottom-0 left-0 right-0 z-[1000] flex flex-col bg-white border-t border-gray-200 rounded-t-xl shadow-[0_-4px_16px_rgba(0,0,0,0.1)]">
          {mobileFoldedContent}
        </div>
      )}
    </>
  );
}
