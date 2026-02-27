"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Footprints, X, ArrowUpDown, Search, Bell, ChevronLeft } from "lucide-react";
import { Icon } from "@/components/icon";
import { PlaceSearchInput } from "./place-search-input";
import type { SavedLocation } from "./place-search-input";
import { RouteLegCard, TransferBadge } from "./route-leg-card";
import { formatDuration, formatTime } from "@/lib/format-utils";
import { getTransportColor } from "@/lib/constants";
import { useTransferViability, type TransferInfo } from "@/hooks/use-transfer-viability";
import { useLeaveReminder } from "@/hooks/use-leave-reminder";
import { useDragDismiss } from "@/hooks/use-drag-dismiss";
import { useSavedPlannerItems } from "@/hooks/use-saved-planner-items";
import type { RoutePlanResponse, PlannedRoute, RouteLeg } from "@/lib/types";
import { SavedPlannerPanel } from "@/components/saved-planner-panel";

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
      new Date(firstTransitDepTime.getTime() - walkBeforeSeconds * 1000).toISOString(),
    );
  }
  if (arrTime && walkAfterSeconds > 0) {
    arr = formatTime(new Date(arrTime.getTime() + walkAfterSeconds * 1000).toISOString());
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
    <div className="flex items-center gap-1.5 flex-wrap">
      {visible.map((leg, i) => (
        <div key={i} className="flex items-center gap-1.5">
          {i > 0 && (
            <Icon name="chevron-right-sm" size={8} className="text-foreground/20 shrink-0" />
          )}
          {leg.mode === "WALK" ? (
            <div className="flex items-center gap-1 text-foreground/60 rounded-full px-1.5 py-0.5 bg-foreground/[0.03]">
              <Footprints size={12} className="shrink-0" />
              <span className="text-[11px] font-medium">{formatDuration(leg.duration)}</span>
            </div>
          ) : (
            <Badge
              className="text-white text-[11px] px-2 py-0 h-5.5 font-semibold shrink-0 rounded-full tracking-tight"
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
  error: string | null;
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
  return (
    <div
      className={`rounded-xl border transition-all duration-150 overflow-hidden ${
        isSelected
          ? "border-primary/30 bg-primary/[0.05] shadow-[0_8px_24px_-16px_rgba(0,96,255,0.5)]"
          : "border-foreground/8 bg-white hover:border-foreground/15"
      }`}
    >
      <button onClick={onClick} className="w-full text-left px-4 py-3.5">
        <RouteSummary
          route={route}
          durationClassName="text-[17px] font-semibold text-foreground/90 tabular-nums tracking-tight"
          timeClassName="text-[13px] font-semibold text-foreground/55 tabular-nums"
          legChainClassName="mt-2"
        />
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 pt-1 border-t border-foreground/6 space-y-1.5">
          {reminderProps && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (reminderProps.isSet) {
                    reminderProps.onClear();
                  } else {
                    reminderProps.onSchedule();
                  }
                }}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-colors text-left cursor-pointer ${
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
                    ? reminderProps.minutesUntil !== null && reminderProps.minutesUntil > 0
                      ? `Leave in ${reminderProps.minutesUntil} min${reminderProps.isLiveAdjusted ? " · auto-adjusting" : ""}`
                      : "Reminder active · tap to cancel"
                    : "Set smart leave reminder"}
                </span>
              </button>
              {!reminderProps.isSet && reminderProps.error && (
                <div className="px-1 text-[11px] text-amber-700 font-medium">
                  {reminderProps.error}
                </div>
              )}
            </>
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

interface RouteSummaryProps {
  route: PlannedRoute;
  durationClassName: string;
  timeClassName: string;
  rowClassName?: string;
  showLegChain?: boolean;
  legChainClassName?: string;
}

function RouteSummary({
  route,
  durationClassName,
  timeClassName,
  rowClassName = "flex items-baseline justify-between gap-3",
  showLegChain = true,
  legChainClassName = "mt-2",
}: RouteSummaryProps) {
  const { dep, arr } = getRouteTimeRange(route);

  return (
    <>
      <div className={rowClassName}>
        <span className={durationClassName}>{formatDuration(route.duration)}</span>
        {dep && arr && <span className={timeClassName}>{dep} — {arr}</span>}
      </div>
      {showLegChain && (
        <div className={legChainClassName}>
          <LegChain legs={route.legs} />
        </div>
      )}
    </>
  );
}

function NoRoutesMessage({ className }: { className: string }) {
  return (
    <div className={className}>
      No routes found. Try different locations.
    </div>
  );
}

function MobileRouteOption({
  route,
  isSelected,
  onClick,
}: {
  route: PlannedRoute;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-2xl border p-4 min-h-[88px] transition-all duration-150 shadow-sm ${
        isSelected
          ? "border-primary/30 bg-primary/[0.05] shadow-[0_10px_24px_-16px_rgba(0,96,255,0.65)]"
          : "border-foreground/8 bg-white active:bg-foreground/2"
      }`}
    >
      <RouteSummary
        route={route}
        durationClassName="text-[24px] leading-none font-semibold tracking-tight text-foreground/90 tabular-nums"
        timeClassName="text-[14px] font-semibold text-foreground/55 tabular-nums"
        legChainClassName="mt-2.5"
      />
    </button>
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
  const {
    dragY: fullDragY,
    isDragging: isFullDragging,
    beginDrag: beginFullDrag,
    updateDrag: updateFullDrag,
    endDrag: endFullDrag,
  } = useDragDismiss({
    thresholdPx: 140,
    velocityThreshold: 0.8,
    onDismiss: onClose,
    maxStartY: 140,
    axisLockRatio: 1.2,
  });
  const {
    dragY: detailDragY,
    isDragging: isDetailDragging,
    beginDrag: beginDetailDrag,
    updateDrag: updateDetailDrag,
    endDrag: endDetailDrag,
  } = useDragDismiss({
    thresholdPx: 120,
    velocityThreshold: 0.7,
    onDismiss: onClose,
  });
  const detailSheetRef = useRef<HTMLDivElement | null>(null);
  const lastDetailSheetHeightRef = useRef(0);

  // Saved routes & places
  const savedItems = useSavedPlannerItems();
  const allSavedLocations = useMemo((): SavedLocation[] => {
    return savedItems.locations.map((loc) => ({
      lat: loc.lat,
      lng: loc.lng,
      name: loc.name,
      nickname: loc.nickname,
    }));
  }, [savedItems.locations]);

  const isLocationSaved = useCallback(
    (lat: number, lng: number): boolean => {
      return savedItems.locations.some(
        (loc) => Math.abs(loc.lat - lat) < 0.0001 && Math.abs(loc.lng - lng) < 0.0001,
      );
    },
    [savedItems.locations],
  );

  const handleSaveLocation = useCallback(
    async (point: { lat: number; lng: number; name: string }, nickname?: string) => {
      await savedItems.saveLocation(point, nickname);
    },
    [savedItems],
  );

  const hasRoutes = !!routePlan?.routes?.length;
  const mobileDetailRoute =
    mobileDetail !== null && hasRoutes ? routePlan.routes[mobileDetail] : null;
  const selectedRoute = routePlan?.routes[selectedRouteIndex] ?? null;

  // Live transfer viability for the selected route
  const transfers = useTransferViability(selectedRoute);
  const transfersByArrivingLeg = new Map(transfers.map((t) => [t.arrivingLeg, t]));

  // Leave reminder for the selected route
  const {
    leaveInfo,
    isSet: isReminderSet,
    isLiveAdjusted,
    minutesUntil,
    lastError,
    scheduleReminder,
    clearReminder,
  } = useLeaveReminder(selectedRoute);

  const reminderProps: ReminderProps | undefined = leaveInfo
    ? {
        isSet: isReminderSet,
        minutesUntil,
        isLiveAdjusted,
        error: lastError,
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!mobileDetailRoute) {
      document.documentElement.style.removeProperty("--mobile-route-sheet-height");
      lastDetailSheetHeightRef.current = 0;
      return;
    }
    const el = detailSheetRef.current;
    if (!el) return;

    const applyHeight = (h: number) => {
      const rounded = Math.max(0, Math.round(h));
      document.documentElement.style.setProperty("--mobile-route-sheet-height", `${rounded}px`);
      if (Math.abs(rounded - lastDetailSheetHeightRef.current) > 8) {
        lastDetailSheetHeightRef.current = rounded;
        onSelectRoute(selectedRouteIndex);
      }
    };

    applyHeight(el.getBoundingClientRect().height);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        applyHeight(entry.contentRect.height);
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--mobile-route-sheet-height");
      lastDetailSheetHeightRef.current = 0;
    };
  }, [mobileDetailRoute, onSelectRoute, selectedRouteIndex]);

  /* ── Shared form block ─────────────────────────────── */
  const formBlock = (
    <div className="p-4 pt-3 space-y-3.5 md:px-5 md:pt-4 md:pb-4 md:space-y-4">
      <div className="md:hidden flex justify-center -mt-1">
        <div className="h-1 w-10 rounded-full bg-foreground/20" />
      </div>

      {/* Origin / destination inputs */}
      <div className="rounded-2xl border border-foreground/8 bg-white p-2.5 shadow-sm">
        <div className="flex gap-2 items-start">
          <div className="flex-1 space-y-2 min-w-0">
            <PlaceSearchInput
              value={origin}
              onSelect={onSetOrigin}
              pickingPoint={pickingPoint}
              pointType="origin"
              onStartPicking={onStartPicking}
              currentLocation={userLocation}
              savedLocations={allSavedLocations}
              onSaveLocation={handleSaveLocation}
              isLocationSaved={isLocationSaved}
            />
            <PlaceSearchInput
              value={destination}
              onSelect={onSetDestination}
              pickingPoint={pickingPoint}
              pointType="destination"
              onStartPicking={onStartPicking}
              savedLocations={allSavedLocations}
              onSaveLocation={handleSaveLocation}
              isLocationSaved={isLocationSaved}
            />
          </div>
          <div className="shrink-0 flex flex-col gap-2">
            <button
              onClick={onSwap}
              className="h-10 w-10 rounded-xl border border-foreground/8 hover:bg-foreground/[0.04] active:bg-foreground/[0.08] transition-colors text-foreground/60 hover:text-foreground/70 bg-white flex items-center justify-center"
              title="Swap"
            >
              <ArrowUpDown size={16} />
            </button>
            <button
              onClick={() => onClear?.()}
              className="h-10 w-10 rounded-xl border border-foreground/10 bg-white text-[11px] font-medium text-foreground/60 active:bg-foreground/[0.04] flex items-center justify-center"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Time selector + search */}
      <div className="space-y-2 md:space-y-2.5">
        <div className="flex items-center gap-2 md:gap-3">
          <select
            value={timeOption}
            onChange={(e) => onTimeOptionChange(e.target.value as TimeOption)}
            className="h-10 rounded-xl border border-foreground/10 bg-white px-3 text-sm text-foreground/80 font-medium focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all flex-1 min-w-0"
          >
            <option value="now">Leave now</option>
            <option value="depart">Depart at</option>
            <option value="arrive">Arrive by</option>
          </select>
          <SavedPlannerPanel
            origin={origin}
            destination={destination}
            onSetOrigin={onSetOrigin}
            onSetDestination={onSetDestination}
            saved={savedItems}
          />
          <Button
            size="sm"
            className="h-10 px-5 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl text-sm shadow-[0_8px_20px_-12px_rgba(0,96,255,0.8)] transition-all active:scale-[0.98] shrink-0"
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
        {timeOption !== "now" && (
          <input
            type="datetime-local"
            value={selectedDateTime}
            onChange={(e) => onDateTimeChange(e.target.value)}
            className="h-10 w-full rounded-xl border border-foreground/10 bg-white px-3 text-sm text-foreground/80 font-medium focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
          />
        )}
      </div>
    </div>
  );

  const noResults = routePlan?.routes?.length === 0 && !planLoading;

  if (mobileDetailRoute) {
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
          onClose,
          reminderProps,
          transfersByArrivingLeg,
        })}

        {/* Mobile detail sheet */}
        <div
          ref={detailSheetRef}
          className={`md:hidden absolute bottom-0 left-0 right-0 z-[1100] bg-white rounded-t-3xl shadow-sheet border-t border-foreground/8 ${
            isDetailDragging ? "" : "transition-transform duration-250 ease-out"
          }`}
          style={{ transform: `translateY(${detailDragY}px)` }}
        >
          <div
            className="flex justify-center pt-2 pb-1 touch-none"
            onTouchStart={(e) => beginDetailDrag(e.touches[0].clientY)}
            onTouchMove={(e) => updateDetailDrag(e.touches[0].clientY)}
            onTouchEnd={endDetailDrag}
            onTouchCancel={endDetailDrag}
          >
            <div className="h-1 w-10 rounded-full bg-foreground/20" />
          </div>
          <div className="flex items-center gap-2 px-4 py-3.5 border-b border-foreground/6">
            <button
              onClick={() => setMobileDetail(null)}
              className="h-8 w-8 rounded-full text-foreground/55 hover:text-foreground/75 hover:bg-foreground/[0.06] active:bg-foreground/[0.1] inline-flex items-center justify-center shrink-0 transition-colors"
              aria-label="Back to all routes"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex-1 min-w-0">
              <RouteSummary
                route={mobileDetailRoute}
                durationClassName="text-[18px] font-semibold text-foreground/90 tabular-nums tracking-tight"
                timeClassName="text-[13px] text-foreground/60 font-semibold tabular-nums"
                rowClassName="flex items-center justify-between gap-3"
                showLegChain={false}
              />
            </div>
            {/* Bell — large target for gloved fingers */}
            {reminderProps && (
              <button
                onClick={() =>
                  reminderProps.isSet ? reminderProps.onClear() : reminderProps.onSchedule()
                }
                className={`p-2.5 rounded-xl transition-colors active:scale-95 shrink-0 cursor-pointer ${
                  reminderProps.isSet
                    ? "bg-primary/10 text-primary"
                    : "text-foreground/40 hover:text-foreground/70"
                }`}
                title={reminderProps.isSet ? "Cancel reminder" : "Remind me to leave"}
              >
                <Bell size={20} fill={reminderProps.isSet ? "currentColor" : "none"} />
              </button>
            )}
          </div>

          <div className="overflow-y-auto max-h-[58vh] p-4 pb-20 space-y-3.5">
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
        onClose,
        reminderProps,
        transfersByArrivingLeg,
      })}

      {/* Mobile fullscreen */}
      <div
        className={`md:hidden absolute inset-0 z-[1100] flex flex-col bg-white ${
          isFullDragging ? "" : "transition-transform duration-250 ease-out"
        }`}
        style={{ transform: `translateY(${fullDragY}px)` }}
        onTouchStart={(e) => beginFullDrag(e.touches[0].clientY, e.touches[0].clientX)}
        onTouchMove={(e) => updateFullDrag(e.touches[0].clientY, e.touches[0].clientX)}
        onTouchEnd={endFullDrag}
        onTouchCancel={endFullDrag}
      >
        {formBlock}

        <div className="h-px bg-foreground/6" />

        <div className="flex-1 min-h-0 overflow-y-auto pb-20">
          {hasRoutes && (
            <div className="p-3 space-y-2.5">
              {routePlan.routes.map((route, i) => {
                return (
                  <MobileRouteOption
                    key={i}
                    route={route}
                    isSelected={i === selectedRouteIndex}
                    onClick={() => handleMobileRouteClick(i)}
                  />
                );
              })}
            </div>
          )}
          {noResults && <NoRoutesMessage className="px-4 py-12 text-center text-sm text-foreground/55 font-medium" />}
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
  onClose: () => void;
  reminderProps?: ReminderProps;
  transfersByArrivingLeg: Map<RouteLeg, TransferInfo>;
}) {
  return (
    <div className="hidden md:flex w-[360px] border-r border-foreground/6 bg-gradient-to-b from-white to-foreground/[0.015] flex-col shrink-0">
      <div className="flex items-center justify-end px-4 h-12 border-b border-foreground/6 shrink-0">
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-foreground/5 text-foreground/60 hover:text-foreground/60 transition-colors"
          aria-label="Close directions panel"
        >
          <X size={16} />
        </button>
      </div>

      {formBlock}
      <div className="h-px bg-foreground/6" />

      {hasRoutes && routePlan && (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          {routePlan.routes.map((route, i) => (
            <RouteCard
              key={i}
              route={route}
              isSelected={i === selectedRouteIndex}
              isExpanded={expandedRoute === i}
              onClick={() => handleRouteClick(i)}
              onLocateVehicle={onLocateVehicle}
              reminderProps={i === selectedRouteIndex ? reminderProps : undefined}
              transfersByArrivingLeg={i === selectedRouteIndex ? transfersByArrivingLeg : undefined}
            />
          ))}
        </div>
      )}

      {noResults && <NoRoutesMessage className="px-4 py-8 text-center text-sm text-foreground/55 font-medium" />}
    </div>
  );
}
