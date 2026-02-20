"use client";

import { Fragment, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Footprints,
  X,
  ChevronLeft,
  ArrowUpDown,
  Search,
  Bell,
} from "lucide-react";
import { Icon } from "@/components/icon";
import { PlaceSearchInput } from "./place-search-input";
import { RouteLegCard, TransferBadge } from "./route-leg-card";
import { formatDuration, formatTime } from "@/lib/format-utils";
import { getTransportColor } from "@/lib/constants";
import {
  useTransferViability,
  type TransferInfo,
} from "@/hooks/use-transfer-viability";
import { useLeaveReminder } from "@/hooks/use-leave-reminder";
import type { RoutePlanResponse, PlannedRoute, RouteLeg } from "@/lib/types";

export type TimeOption = "now" | "depart" | "arrive";

/* ── Helpers ────────────────────────────────────────────────── */

function getRouteTimeRange(route: PlannedRoute) {
  let firstTransitDep = "";
  let firstTransitDepTime: Date | null = null;
  let arrTime: Date | null = null;
  let walkBeforeSeconds = 0;
  let walkAfterSeconds = 0;
  let foundFirstTransit = false;

  for (const leg of route.legs) {
    if (leg.mode === "WALK") {
      const match = String(leg.duration).match(/(\d+)s/);
      if (match) {
        if (!foundFirstTransit) walkBeforeSeconds += parseInt(match[1], 10);
        else walkAfterSeconds += parseInt(match[1], 10);
      }
    } else {
      if (!foundFirstTransit) {
        foundFirstTransit = true;
        if (leg.scheduledDeparture) {
          firstTransitDep = formatTime(leg.scheduledDeparture);
          firstTransitDepTime = new Date(leg.scheduledDeparture);
        }
      }
      if (leg.scheduledArrival) arrTime = new Date(leg.scheduledArrival);
    }
  }

  let dep = firstTransitDep;
  let arr = arrTime ? formatTime(arrTime.toISOString()) : "";

  if (firstTransitDepTime && walkBeforeSeconds > 0) {
    dep = formatTime(
      new Date(
        firstTransitDepTime.getTime() - walkBeforeSeconds * 1000,
      ).toISOString(),
    );
  }
  if (arrTime && walkAfterSeconds > 0) {
    arr = formatTime(
      new Date(arrTime.getTime() + walkAfterSeconds * 1000).toISOString(),
    );
  }

  return {
    dep,
    arr,
    firstTransitDep,
    walkBefore: Math.round(walkBeforeSeconds / 60),
  };
}

/* ── Leg chain (compact badges) ─────────────────────────────── */

function LegChain({ legs }: { legs: RouteLeg[] }) {
  const visible = legs.filter(
    (l) => !(l.mode === "WALK" && formatDuration(l.duration) === "0 min"),
  );

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {visible.map((leg, i) => (
        <div key={i} className="flex items-center gap-1">
          {i > 0 && (
            <Icon
              name="chevron-right-sm"
              size={8}
              className="text-foreground/20 shrink-0"
            />
          )}
          {leg.mode === "WALK" ? (
            <div className="flex items-center gap-1 text-foreground/60">
              <Footprints size={12} className="shrink-0" />
              <span className="text-[10px] font-semibold">
                {formatDuration(leg.duration)}
              </span>
            </div>
          ) : (
            <Badge
              className="text-white text-[10px] px-1.5 py-0 h-5 font-bold shrink-0 rounded-md"
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

/* ── Leg list with interleaved transfer badges ──────────────── */

function LegList({
  route,
  transfersByArrivingLeg,
  onLocateVehicle,
}: {
  route: PlannedRoute;
  transfersByArrivingLeg: Map<RouteLeg, TransferInfo>;
  onLocateVehicle: (leg: RouteLeg) => void;
}) {
  const visible = route.legs.filter(
    (l) => !(l.mode === "WALK" && formatDuration(l.duration) === "0 min"),
  );

  return (
    <>
      {visible.map((leg, i) => (
        <Fragment key={i}>
          <RouteLegCard leg={leg} onLocateVehicle={onLocateVehicle} />
          {transfersByArrivingLeg.has(leg) && (
            <TransferBadge transfer={transfersByArrivingLeg.get(leg)!} />
          )}
        </Fragment>
      ))}
    </>
  );
}

/* ── Route card ─────────────────────────────────────────────── */

interface ReminderProps {
  isSet: boolean;
  minutesUntil: number | null;
  isLiveAdjusted: boolean;
  onSchedule: () => void;
  onClear: () => void;
}

function RouteCard({
  route,
  isSelected,
  isExpanded,
  onClick,
  onLocateVehicle,
  reminderProps,
  transfersByArrivingLeg,
}: {
  route: PlannedRoute;
  isSelected: boolean;
  isExpanded: boolean;
  onClick: () => void;
  onLocateVehicle: (leg: RouteLeg) => void;
  reminderProps?: ReminderProps;
  transfersByArrivingLeg?: Map<RouteLeg, TransferInfo>;
}) {
  const { dep, arr } = getRouteTimeRange(route);

  return (
    <div
      className={`rounded-xl border transition-all duration-150 overflow-hidden ${
        isSelected
          ? "border-primary/25 bg-primary/[0.04]"
          : "border-foreground/8 bg-white hover:border-foreground/15"
      }`}
    >
      <button onClick={onClick} className="w-full text-left px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-base font-bold text-foreground/90 tabular-nums">
            {formatDuration(route.duration)}
          </span>
          {dep && arr && (
            <span className="text-xs font-semibold text-foreground/55 tabular-nums">
              {dep} — {arr}
            </span>
          )}
        </div>
        <div className="mt-2">
          <LegChain legs={route.legs} />
        </div>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 pt-1 border-t border-foreground/6 space-y-1.5">
          {reminderProps && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (reminderProps.isSet) {
                  reminderProps.onClear();
                } else {
                  reminderProps.onSchedule();
                }
              }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-colors text-left ${
                reminderProps.isSet
                  ? "bg-primary/6 border-primary/20 text-primary"
                  : "bg-foreground/2 border-foreground/8 text-foreground/60 hover:text-foreground/80"
              }`}
            >
              <Bell
                size={14}
                fill={reminderProps.isSet ? "currentColor" : "none"}
                className="shrink-0"
              />
              <span className="text-xs font-semibold">
                {reminderProps.isSet
                  ? reminderProps.minutesUntil !== null &&
                    reminderProps.minutesUntil > 0
                    ? `Leave in ${reminderProps.minutesUntil} min${reminderProps.isLiveAdjusted ? " · auto-adjusting" : ""}`
                    : "Reminder active · tap to cancel"
                  : "Set smart leave reminder"}
              </span>
            </button>
          )}
          <LegList
            route={route}
            transfersByArrivingLeg={transfersByArrivingLeg ?? new Map()}
            onLocateVehicle={onLocateVehicle}
          />
        </div>
      )}
    </div>
  );
}

/* ── Main RoutePlanner ──────────────────────────────────────── */

interface RoutePlannerProps {
  userLocation: { lat: number; lng: number } | null;
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
  openSelectedRouteDetails?: boolean;
  onConsumeOpenSelectedRouteDetails?: () => void;
}

export function RoutePlanner({
  userLocation,
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
  openSelectedRouteDetails = false,
  onConsumeOpenSelectedRouteDetails,
}: RoutePlannerProps) {
  const [expandedRoute, setExpandedRoute] = useState<number | null>(null);
  const [mobileDetail, setMobileDetail] = useState<number | null>(null);

  const hasRoutes = !!(routePlan?.routes?.length);
  const selectedRoute = routePlan?.routes[selectedRouteIndex] ?? null;

  // Live transfer viability for the selected route
  const transfers = useTransferViability(selectedRoute);
  const transfersByArrivingLeg = new Map(
    transfers.map((t) => [t.arrivingLeg, t]),
  );

  // Leave reminder for the selected route
  const {
    leaveInfo,
    isSet: isReminderSet,
    isLiveAdjusted,
    minutesUntil,
    scheduleReminder,
    clearReminder,
  } = useLeaveReminder(selectedRoute);

  const reminderProps: ReminderProps | undefined = leaveInfo
    ? {
        isSet: isReminderSet,
        minutesUntil,
        isLiveAdjusted,
        onSchedule: scheduleReminder,
        onClear: clearReminder,
      }
    : undefined;

  const handleRouteClick = (i: number) => {
    onSelectRoute(i);
    setExpandedRoute((prev) => (prev === i ? null : i));
  };

  const handleMobileRouteClick = (i: number) => {
    onSelectRoute(i);
    setMobileDetail(i);
  };

  useEffect(() => {
    if (!openSelectedRouteDetails || !hasRoutes || !routePlan) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      const idx =
        selectedRouteIndex >= 0 && selectedRouteIndex < routePlan.routes.length
          ? selectedRouteIndex
          : 0;
      onSelectRoute(idx);
      setExpandedRoute(idx);
      setMobileDetail(idx);
      onConsumeOpenSelectedRouteDetails?.();
    });
    return () => {
      cancelled = true;
    };
  }, [
    openSelectedRouteDetails,
    hasRoutes,
    routePlan,
    selectedRouteIndex,
    onSelectRoute,
    onConsumeOpenSelectedRouteDetails,
  ]);

  /* ── Shared form block ─────────────────────────────── */
  const formBlock = (
    <div className="p-4 space-y-3">
      {/* Origin / destination inputs */}
      <div className="flex gap-2 items-start">
        <div className="flex-1 space-y-2 min-w-0">
          <PlaceSearchInput
            label="origin"
            dotColor="transparent"
            value={origin}
            onSelect={onSetOrigin}
            pickingPoint={pickingPoint}
            pointType="origin"
            onStartPicking={onStartPicking}
            currentLocation={userLocation}
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
          className="mt-3 p-2.5 rounded-xl border border-foreground/8 hover:bg-foreground/[0.04] active:bg-foreground/[0.08] transition-colors text-foreground/60 hover:text-foreground/60 shrink-0"
          title="Swap"
        >
          <ArrowUpDown size={16} />
        </button>
      </div>

      {/* Time selector + search */}
      <div className="flex items-center gap-2">
        <select
          value={timeOption}
          onChange={(e) => onTimeOptionChange(e.target.value as TimeOption)}
          className="h-9 rounded-xl border border-foreground/10 bg-white px-2.5 text-sm text-foreground/80 font-medium focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
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
            className="h-9 rounded-xl border border-foreground/10 bg-white px-2.5 text-sm text-foreground/80 font-medium focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all flex-1 min-w-0"
          />
        )}
        <Button
          size="sm"
          className="h-9 px-5 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl text-sm shadow-sm transition-all active:scale-[0.98] ml-auto shrink-0"
          disabled={!origin || !destination || planLoading}
          onClick={onPlanRoute}
        >
          {planLoading ? (
            <span className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Searching
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Search size={14} />
              Search
            </span>
          )}
        </Button>
      </div>
    </div>
  );

  const noResults = routePlan?.routes?.length === 0 && !planLoading;

  /* ── Mobile detail view ────────────────────────────── */
  const mobileDetailRoute =
    mobileDetail !== null && hasRoutes
      ? routePlan.routes[mobileDetail]
      : null;

  if (mobileDetailRoute) {
    const { dep, arr } = getRouteTimeRange(mobileDetailRoute);
    return (
      <>
        {/* Desktop sidebar (keep visible) */}
        {desktopSidebar({
          formBlock,
          hasRoutes,
          routePlan,
          selectedRouteIndex,
          expandedRoute,
          handleRouteClick,
          onLocateVehicle,
          noResults,
          onClear,
          onClose,
          reminderProps,
          transfersByArrivingLeg,
        })}

        {/* Mobile detail sheet */}
        <div className="md:hidden absolute bottom-0 left-0 right-0 z-[1000] bg-white rounded-t-2xl shadow-sheet animate-slide-up">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-foreground/6">
            <button
              onClick={() => setMobileDetail(null)}
              className="p-1 rounded-lg hover:bg-foreground/5 transition-colors text-foreground/60"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-bold text-foreground/90">
                  {formatDuration(mobileDetailRoute.duration)}
                </span>
                {dep && arr && (
                  <span className="text-xs text-foreground/60 font-semibold tabular-nums">
                    {dep} — {arr}
                  </span>
                )}
              </div>
              <div className="mt-1">
                <LegChain legs={mobileDetailRoute.legs} />
              </div>
            </div>
            {/* Bell — large target for gloved fingers */}
            {reminderProps && (
              <button
                onClick={() =>
                  reminderProps.isSet
                    ? reminderProps.onClear()
                    : reminderProps.onSchedule()
                }
                className={`p-2.5 rounded-xl transition-colors active:scale-95 shrink-0 ${
                  reminderProps.isSet
                    ? "bg-primary/10 text-primary"
                    : "text-foreground/40 hover:text-foreground/70"
                }`}
                title={
                  reminderProps.isSet ? "Cancel reminder" : "Remind me to leave"
                }
              >
                <Bell
                  size={20}
                  fill={reminderProps.isSet ? "currentColor" : "none"}
                />
              </button>
            )}
          </div>

          <div className="overflow-y-auto max-h-[55vh] p-3 space-y-1.5">
            {/* Reminder countdown banner */}
            {reminderProps?.isSet && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-primary/6 border border-primary/15">
                <Bell size={14} className="text-primary shrink-0" />
                <span className="text-xs text-primary font-semibold">
                  {minutesUntil !== null && minutesUntil > 0
                    ? `Leave in ${minutesUntil} min${isLiveAdjusted ? " · auto-adjusting live" : ""}`
                    : "Reminder active"}
                </span>
              </div>
            )}
            <LegList
              route={mobileDetailRoute}
              transfersByArrivingLeg={transfersByArrivingLeg}
              onLocateVehicle={onLocateVehicle}
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Desktop sidebar */}
      {desktopSidebar({
        formBlock,
        hasRoutes,
        routePlan,
        selectedRouteIndex,
        expandedRoute,
        handleRouteClick,
        onLocateVehicle,
        noResults,
        onClear,
        onClose,
        reminderProps,
        transfersByArrivingLeg,
      })}

      {/* Mobile fullscreen */}
      <div className="md:hidden absolute inset-0 z-[1000] flex flex-col bg-white">
        <div className="flex items-center justify-between px-4 h-12 border-b border-foreground/6 shrink-0">
          <h2 className="font-bold text-foreground/90">Directions</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onClear?.()}
              className="px-2.5 py-1 text-xs text-foreground/60 hover:text-foreground/80 rounded-lg font-semibold transition-colors"
            >
              Clear
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-foreground/5 text-foreground/60 hover:text-foreground/60 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {formBlock}

        <div className="h-px bg-foreground/6" />

        <div className="flex-1 min-h-0 overflow-y-auto">
          {hasRoutes && (
            <div className="p-3 space-y-2">
              {routePlan.routes.map((route, i) => {
                const { dep, arr } = getRouteTimeRange(route);
                return (
                  <button
                    key={i}
                    onClick={() => handleMobileRouteClick(i)}
                    className={`w-full text-left rounded-xl border p-4 transition-all duration-150 ${
                      i === selectedRouteIndex
                        ? "border-primary/25 bg-primary/[0.04]"
                        : "border-foreground/8 bg-white active:bg-foreground/2"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-base font-bold text-foreground/90 tabular-nums">
                        {formatDuration(route.duration)}
                      </span>
                      {dep && arr && (
                        <span className="text-xs font-semibold text-foreground/55 tabular-nums">
                          {dep} — {arr}
                        </span>
                      )}
                    </div>
                    <div className="mt-2">
                      <LegChain legs={route.legs} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {noResults && (
            <div className="px-4 py-12 text-center text-sm text-foreground/55 font-medium">
              No routes found. Try different locations.
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ── Desktop sidebar (extracted to avoid duplication) ──────── */

function desktopSidebar({
  formBlock,
  hasRoutes,
  routePlan,
  selectedRouteIndex,
  expandedRoute,
  handleRouteClick,
  onLocateVehicle,
  noResults,
  onClear,
  onClose,
  reminderProps,
  transfersByArrivingLeg,
}: {
  formBlock: React.ReactNode;
  hasRoutes: boolean;
  routePlan: RoutePlanResponse | null;
  selectedRouteIndex: number;
  expandedRoute: number | null;
  handleRouteClick: (i: number) => void;
  onLocateVehicle: (leg: RouteLeg) => void;
  noResults: boolean;
  onClear?: () => void;
  onClose: () => void;
  reminderProps?: ReminderProps;
  transfersByArrivingLeg: Map<RouteLeg, TransferInfo>;
}) {
  return (
    <div className="hidden md:flex w-[340px] border-r border-foreground/6 bg-white flex-col shrink-0">
      <div className="flex items-center justify-between px-4 h-12 border-b border-foreground/6 shrink-0">
        <h2 className="font-bold text-foreground/90">Directions</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onClear?.()}
            className="px-2.5 py-1 text-xs text-foreground/60 hover:text-foreground/80 rounded-lg font-semibold transition-colors"
          >
            Clear
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-foreground/5 text-foreground/60 hover:text-foreground/60 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {formBlock}
      <div className="h-px bg-foreground/6" />

      {hasRoutes && routePlan && (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
          {routePlan.routes.map((route, i) => (
            <RouteCard
              key={i}
              route={route}
              isSelected={i === selectedRouteIndex}
              isExpanded={expandedRoute === i}
              onClick={() => handleRouteClick(i)}
              onLocateVehicle={onLocateVehicle}
              reminderProps={
                i === selectedRouteIndex ? reminderProps : undefined
              }
              transfersByArrivingLeg={
                i === selectedRouteIndex ? transfersByArrivingLeg : undefined
              }
            />
          ))}
        </div>
      )}

      {noResults && (
        <div className="px-4 py-8 text-center text-sm text-foreground/55 font-medium">
          No routes found. Try different locations.
        </div>
      )}
    </div>
  );
}
