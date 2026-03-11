"use client";

import { Fragment, useState, type ComponentProps, type ReactNode, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRightLeft,
  ArrowUpDown,
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  CornerDownLeft,
  Footprints,
  Plus,
  Search,
  Trash2,
  X,
  Zap,
  AlertTriangle,
} from "lucide-react";
import { Icon } from "@/components/icon";
import { PlaceSearchInput } from "./place-search-input";
import { RouteLegCard, TransferBadge } from "./route-leg-card";
import { formatDuration, formatTime } from "@/lib/format-utils";
import { getTransportColor } from "@/lib/constants";
import type { TransferInfo } from "@/hooks/use-transfer-viability";
import { useDragDismiss } from "@/hooks/use-drag-dismiss";
import { usePlannerSavedLocations } from "@/hooks/use-planner-saved-locations";
import { useRoutePlannerSelection } from "@/hooks/use-route-planner-selection";
import { useRoutePlannerInsights } from "@/hooks/use-route-planner-insights";
import type { MultiRoutePlanResponse, PlannedRoute, RouteLeg, RoutePlanResponse } from "@/lib/types";
import { SavedPlannerPanel } from "@/components/saved-planner-panel";
import { useTransitStore, type PlannerStop } from "@/store/use-transit-store";
import { ROUTING_MODES } from "@/lib/route-filter";

type TimeOption = "now" | "depart" | "arrive";

interface ReminderProps {
  isSet: boolean;
  minutesUntil: number | null;
  isLiveAdjusted: boolean;
  error: string | null;
  status: {
    tone: "info" | "warning" | "error";
    message: string;
  } | null;
  onSchedule: () => void;
  onClear: () => void;
}

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

  return { dep, arr };
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

function hasResolvedStops(stops: PlannerStop[]) {
  return stops.length >= 2 && stops.every((stop) => !!stop.point);
}

function stopLabel(index: number) {
  return String.fromCharCode(65 + index);
}

function stopPlaceholder(index: number, totalStops: number) {
  if (index === 0) return "From";
  if (index === totalStops - 1) return "To";
  return `Stop ${index}`;
}

function getLegKey(leg: RouteLeg, index: number) {
  return [
    leg.mode,
    leg.lineNumber ?? leg.lineName ?? index,
    leg.departureStop ?? "",
    leg.arrivalStop ?? "",
    leg.scheduledDeparture ?? "",
    leg.scheduledArrival ?? "",
  ].join(":");
}

function getRouteKey(route: PlannedRoute, index: number) {
  const firstLeg = route.legs[0];
  const lastLeg = route.legs[route.legs.length - 1];
  return [
    route.duration,
    route.distanceMeters,
    firstLeg?.departureStop ?? "",
    lastLeg?.arrivalStop ?? "",
    index,
  ].join(":");
}

function LegChain({ legs }: { legs: RouteLeg[] }) {
  const visible = legs.filter(
    (leg) => !(leg.mode === "WALK" && formatDuration(leg.duration) === "0 min"),
  );

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {visible.map((leg, index) => (
        <div key={getLegKey(leg, index)} className="flex items-center gap-1.5">
          {index > 0 && (
            <Icon name="chevron-right-sm" size={8} className="text-foreground/20 shrink-0" />
          )}
          {leg.mode === "WALK" ? (
            <div className="flex items-center gap-1 text-foreground/60 rounded-full px-1.5 py-0.5 bg-foreground/3">
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

function LegList({
  route,
  transfersByArrivingLeg,
  onLocateVehicle,
  allowLocateVehicle = true,
}: {
  route: PlannedRoute;
  transfersByArrivingLeg: Map<RouteLeg, TransferInfo>;
  onLocateVehicle: (leg: RouteLeg) => void;
  allowLocateVehicle?: boolean;
}) {
  const visible = route.legs.filter(
    (leg) => !(leg.mode === "WALK" && formatDuration(leg.duration) === "0 min"),
  );

  return (
    <>
      {visible.map((leg, index) => (
        <Fragment key={getLegKey(leg, index)}>
          <RouteLegCard
            leg={leg}
            onLocateVehicle={onLocateVehicle}
            allowLocateVehicle={allowLocateVehicle}
          />
          {allowLocateVehicle && transfersByArrivingLeg.has(leg) && (
            <TransferBadge transfer={transfersByArrivingLeg.get(leg)!} />
          )}
        </Fragment>
      ))}
    </>
  );
}

function getReminderStatusClassName(tone: "info" | "warning" | "error") {
  if (tone === "error") return "text-rose-700";
  if (tone === "warning") return "text-amber-700";
  return "text-sky-700";
}

function RouteSummary({
  route,
  durationClassName,
  timeClassName,
  rowClassName = "flex items-baseline justify-between gap-3",
  showLegChain = true,
  legChainClassName = "mt-2",
}: {
  route: PlannedRoute;
  durationClassName: string;
  timeClassName: string;
  rowClassName?: string;
  showLegChain?: boolean;
  legChainClassName?: string;
}) {
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

function getFirstTransitDepartureMs(route: PlannedRoute) {
  for (const leg of route.legs) {
    if (leg.mode !== "WALK" && leg.scheduledDeparture) {
      return new Date(leg.scheduledDeparture).getTime();
    }
  }
  return null;
}

function StaleRouteBanner({ route, onReplan }: { route: PlannedRoute; onReplan?: () => void }) {
  const restoredFromSnapshot = useTransitStore((s) => s.restoredFromSnapshot);
  const [now] = useState(() => Date.now());

  if (!restoredFromSnapshot) return null;

  const depMs = getFirstTransitDepartureMs(route);
  if (!depMs) return null;

  const minutesPast = (now - depMs) / 60_000;
  if (minutesPast < 2) return null;

  const isExpired = minutesPast > 10;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left ${
        isExpired
          ? "bg-red-50 border-red-200 text-red-700"
          : "bg-yellow-50 border-yellow-200 text-yellow-700"
      }`}
    >
      <AlertTriangle size={14} className="shrink-0" />
      <span className="flex-1 text-xs font-medium">
        {isExpired
          ? "This trip has already departed."
          : "This route was restored from your reminder. Times may be outdated."}
      </span>
      {onReplan && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onReplan();
          }}
          className="shrink-0 text-xs font-semibold underline underline-offset-2"
        >
          Re-plan
        </button>
      )}
    </div>
  );
}

function RouteCard({
  route,
  isSelected,
  isExpanded,
  onClick,
  onLocateVehicle,
  onReplan,
  reminderProps,
  transfersByArrivingLeg,
}: {
  route: PlannedRoute;
  isSelected: boolean;
  isExpanded: boolean;
  onClick: () => void;
  onLocateVehicle: (leg: RouteLeg) => void;
  onReplan?: () => void;
  reminderProps?: ReminderProps;
  transfersByArrivingLeg?: Map<RouteLeg, TransferInfo>;
}) {
  return (
    <div
      className={`rounded-xl border transition-all duration-150 overflow-hidden ${
        isSelected
          ? "border-primary/30 bg-primary/5 shadow-[0_8px_24px_-16px_rgba(0,96,255,0.5)]"
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
          <StaleRouteBanner route={route} onReplan={onReplan} />
          {reminderProps && (
            <>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  if (reminderProps.isSet) reminderProps.onClear();
                  else reminderProps.onSchedule();
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
              {!reminderProps.isSet && reminderProps.status && (
                <div
                  className={`px-1 text-[11px] font-medium ${getReminderStatusClassName(reminderProps.status.tone)}`}
                >
                  {reminderProps.status.message}
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
      className={`w-full text-left rounded-2xl border p-4 min-h-22 transition-all duration-150 shadow-sm ${
        isSelected
          ? "border-primary/30 bg-primary/5 shadow-[0_10px_24px_-16px_rgba(0,96,255,0.65)]"
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

function NoRoutesMessage({ className }: { className: string }) {
  return <div className={className}>No routes found. Try different locations.</div>;
}

function PlannerStopEditor({
  stop,
  index,
  totalStops,
  pickingPoint,
  userLocation,
  allSavedLocations,
  handleSaveLocation,
  isLocationSaved,
  onStartPicking,
  onSetStopPoint,
  onSetStopDepartureOverride,
  onMoveStop,
  onRemoveStop,
}: {
  stop: PlannerStop;
  index: number;
  totalStops: number;
  pickingPoint: string | null;
  userLocation: { lat: number; lng: number } | null;
  allSavedLocations: { lat: number; lng: number; name: string; nickname?: string }[];
  handleSaveLocation: (point: { lat: number; lng: number; name: string }, nickname?: string) => void;
  isLocationSaved: (lat: number, lng: number) => boolean;
  onStartPicking: (stopId: string | null) => void;
  onSetStopPoint: (stopId: string, place: { lat: number; lng: number; name?: string }) => void;
  onSetStopDepartureOverride: (stopId: string, departureOverride: string) => void;
  onMoveStop: (stopId: string, direction: -1 | 1) => void;
  onRemoveStop: (stopId: string) => void;
}) {
  const isFirst = index === 0;
  const isLast = index === totalStops - 1;
  const isIntermediate = !isFirst && !isLast;
  const isMultiStop = totalStops > 2;
  const canMoveUp = index > 0;
  const canMoveDown = index < totalStops - 1;
  const canRemove = totalStops > 2 && !isFirst;

  return (
    <div>
      <div className="flex items-center gap-2.5">
        <div
          className={`w-7 h-7 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 ${
            isFirst
              ? "bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-200"
              : isLast
                ? "bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-200"
                : "bg-foreground/[0.04] text-foreground/55 ring-1 ring-inset ring-foreground/10"
          }`}
        >
          {stopLabel(index)}
        </div>

        <div className="flex-1 min-w-0">
          <PlaceSearchInput
            value={stop.point}
            onSelect={(place) => onSetStopPoint(stop.id, place)}
            pickingPoint={pickingPoint}
            pointId={stop.id}
            onStartPicking={onStartPicking}
            placeholder={stopPlaceholder(index, totalStops)}
            currentLocation={userLocation}
            allowCurrentLocation={isFirst}
            savedLocations={allSavedLocations}
            onSaveLocation={handleSaveLocation}
            isLocationSaved={isLocationSaved}
          />
        </div>

        <div className="flex items-center shrink-0">
          {isMultiStop && (
            <div className="flex flex-col -my-1">
              <button
                type="button"
                disabled={!canMoveUp}
                onClick={() => onMoveStop(stop.id, -1)}
                className="w-6 h-5 rounded text-foreground/30 hover:text-foreground/60 disabled:opacity-0 disabled:pointer-events-none inline-flex items-center justify-center transition-colors"
                aria-label={`Move stop ${index + 1} up`}
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                disabled={!canMoveDown}
                onClick={() => onMoveStop(stop.id, 1)}
                className="w-6 h-5 rounded text-foreground/30 hover:text-foreground/60 disabled:opacity-0 disabled:pointer-events-none inline-flex items-center justify-center transition-colors"
                aria-label={`Move stop ${index + 1} down`}
              >
                <ChevronDown size={14} />
              </button>
            </div>
          )}
          {canRemove && (
            <button
              type="button"
              onClick={() => onRemoveStop(stop.id)}
              className="w-7 h-7 rounded-lg text-foreground/25 hover:text-rose-500 hover:bg-rose-50 inline-flex items-center justify-center transition-colors"
              aria-label={`Remove stop ${index + 1}`}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {isIntermediate && (
        <label className="mt-1.5 ml-[38px] inline-flex items-center gap-1.5 rounded-lg border border-foreground/8 bg-foreground/[0.02] px-2.5 py-1.5">
          <span className="text-[10px] uppercase tracking-wider text-foreground/40 font-semibold">
            Depart at
          </span>
          <input
            type="time"
            value={stop.departureOverride}
            onChange={(event) => {
              onSetStopDepartureOverride(stop.id, event.target.value);
            }}
            className="bg-transparent outline-none text-xs font-semibold text-foreground/80 tabular-nums"
          />
        </label>
      )}
    </div>
  );
}

function MultiRouteResults({
  plan,
  onLocateVehicle,
}: {
  plan: MultiRoutePlanResponse | null;
  onLocateVehicle: (leg: RouteLeg) => void;
}) {
  const itinerary = plan?.itinerary;
  const failure = plan?.failedSegment;
  const [expandedSegmentIndex, setExpandedSegmentIndex] = useState<number | null>(
    itinerary?.segments[0]?.segmentIndex ?? null,
  );

  if (!itinerary && !failure) return null;

  return (
    <div className="space-y-3">
      {itinerary && (
        <div className="rounded-2xl border border-foreground/8 bg-white p-4 shadow-sm">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-foreground/40 font-semibold">
                Itinerary
              </div>
              <div className="mt-1 text-[22px] font-semibold tracking-tight text-foreground/90">
                {formatDuration(itinerary.totalTravelDuration)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[13px] font-semibold text-foreground/65 tabular-nums">
                {formatTime(itinerary.startTime)} — {formatTime(itinerary.endTime)}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {itinerary.segments.map((segment) => (
              <Badge
                key={segment.id}
                variant="secondary"
                className="rounded-full bg-foreground/[0.04] text-foreground/65"
              >
                {segment.origin.name} to {segment.destination.name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {itinerary?.segments.map((segment, index) => {
        const isExpanded = expandedSegmentIndex === segment.segmentIndex;
        const transferMap = new Map<RouteLeg, TransferInfo>();

        return (
          <div
            key={segment.id}
            className={`rounded-2xl border overflow-hidden ${
              isExpanded
                ? "border-primary/25 bg-primary/[0.03] shadow-[0_10px_24px_-18px_rgba(0,96,255,0.45)]"
                : "border-foreground/8 bg-white"
            }`}
          >
            <button
              onClick={() => setExpandedSegmentIndex(isExpanded ? null : segment.segmentIndex)}
              className="w-full px-4 py-3.5 text-left"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] uppercase tracking-[0.2em] text-foreground/35 font-semibold">
                      Leg {index + 1}
                    </span>
                    <span className="text-sm font-semibold text-foreground/85">
                      {segment.origin.name} to {segment.destination.name}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 flex-wrap text-[12px] text-foreground/55 font-medium">
                    <span className="tabular-nums">
                      {formatTime(segment.departureTime)} — {formatTime(segment.arrivalTime)}
                    </span>
                    <span>{formatDuration(segment.route.duration)}</span>
                    {segment.dwellMinutes > 0 && <span>then stay {segment.dwellMinutes} min</span>}
                  </div>
                  <div className="mt-2">
                    <LegChain legs={segment.route.legs} />
                  </div>
                </div>
                <div className="text-foreground/35">
                  {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-foreground/6 px-3 py-3 space-y-2">
                <LegList
                  route={segment.route}
                  transfersByArrivingLeg={transferMap}
                  onLocateVehicle={onLocateVehicle}
                />
              </div>
            )}
          </div>
        );
      })}

      {failure && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.2em] text-rose-500 font-semibold">
            Segment unavailable
          </div>
          <div className="mt-1 text-sm font-semibold text-rose-700">
            {failure.origin.name} to {failure.destination.name}
          </div>
          <div className="mt-1 text-[12px] text-rose-700/90">{failure.message}</div>
        </div>
      )}
    </div>
  );
}

function desktopSidebar({
  formBlock,
  hasRoutes,
  routePlan,
  selectedRouteIndex,
  expandedRoute,
  handleRouteClick,
  onLocateVehicle,
  onReplan,
  noResults,
  onClose,
  reminderProps,
  transfersByArrivingLeg,
  isMultiStopJourney,
  multiRoutePlan,
}: {
  formBlock: ReactNode;
  hasRoutes: boolean;
  routePlan: RoutePlanResponse | null;
  selectedRouteIndex: number;
  expandedRoute: number | null;
  handleRouteClick: (index: number) => void;
  onLocateVehicle: (leg: RouteLeg) => void;
  onReplan?: () => void;
  noResults: boolean;
  onClose: () => void;
  reminderProps?: ReminderProps;
  transfersByArrivingLeg: Map<RouteLeg, TransferInfo>;
  isMultiStopJourney: boolean;
  multiRoutePlan: MultiRoutePlanResponse | null;
}) {
  return (
    <div className="hidden md:flex w-90 border-r border-foreground/6 bg-linear-to-b from-white to-foreground/1.5 flex-col shrink-0">
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

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {isMultiStopJourney ? (
          <>
            <MultiRouteResults
              key={
                multiRoutePlan?.itinerary?.startTime ??
                `failure-${multiRoutePlan?.failedSegment?.segmentIndex ?? "none"}`
              }
              plan={multiRoutePlan}
              onLocateVehicle={onLocateVehicle}
            />
            {noResults && (
              <NoRoutesMessage className="px-4 py-8 text-center text-sm text-foreground/55 font-medium" />
            )}
          </>
        ) : (
          <>
            {hasRoutes &&
              routePlan?.routes.map((route, index) => (
                <RouteCard
                  key={getRouteKey(route, index)}
                  route={route}
                  isSelected={index === selectedRouteIndex}
                  isExpanded={expandedRoute === index}
                  onClick={() => handleRouteClick(index)}
                  onLocateVehicle={onLocateVehicle}
                  onReplan={onReplan}
                  reminderProps={index === selectedRouteIndex ? reminderProps : undefined}
                  transfersByArrivingLeg={index === selectedRouteIndex ? transfersByArrivingLeg : undefined}
                />
              ))}
            {noResults && (
              <NoRoutesMessage className="px-4 py-8 text-center text-sm text-foreground/55 font-medium" />
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface RoutePlannerFormBlockProps {
  plannerStops: PlannerStop[];
  pickingPoint: string | null;
  userLocation: { lat: number; lng: number } | null;
  allSavedLocations: { lat: number; lng: number; name: string; nickname?: string }[];
  handleSaveLocation: (point: { lat: number; lng: number; name: string }, nickname?: string) => void;
  isLocationSaved: (lat: number, lng: number) => boolean;
  onStartPicking: (stopId: string | null) => void;
  onSetStopPoint: (stopId: string, place: { lat: number; lng: number; name?: string }) => void;
  onSetStopDepartureOverride: (stopId: string, departureOverride: string) => void;
  onMoveStop: (stopId: string, direction: -1 | 1) => void;
  onRemoveStop: (stopId: string) => void;
  onAddStop: () => void;
  onReturnToStart: () => void;
  onSwapEndpoints: () => void;
  onClear?: () => void;
  origin: PlannerStop["point"];
  destination: PlannerStop["point"];
  isMultiStopJourney: boolean;
  savedItems: ComponentProps<typeof SavedPlannerPanel>["saved"];
  canSearch: boolean;
  planLoading: boolean;
  onPlanRoute: () => void;
  timeOption: TimeOption;
  onTimeOptionChange: (option: TimeOption) => void;
  selectedDateTime: string;
  onDateTimeChange: (dateTime: string) => void;
  hasPlannerErrors: boolean;
  planError: string | null;
  routingMode: (typeof ROUTING_MODES)[number]["value"];
  onSetRoutingMode: (mode: (typeof ROUTING_MODES)[number]["value"]) => void;
}

function RoutePlannerFormBlock({
  plannerStops,
  pickingPoint,
  userLocation,
  allSavedLocations,
  handleSaveLocation,
  isLocationSaved,
  onStartPicking,
  onSetStopPoint,
  onSetStopDepartureOverride,
  onMoveStop,
  onRemoveStop,
  onAddStop,
  onReturnToStart,
  onSwapEndpoints,
  onClear,
  origin,
  destination,
  isMultiStopJourney,
  savedItems,
  canSearch,
  planLoading,
  onPlanRoute,
  timeOption,
  onTimeOptionChange,
  selectedDateTime,
  onDateTimeChange,
  hasPlannerErrors,
  planError,
  routingMode,
  onSetRoutingMode,
}: RoutePlannerFormBlockProps) {
  return (
    <div className="p-4 pt-3 space-y-3 md:px-5 md:pt-4 md:pb-4 md:space-y-3.5">
      <div className="md:hidden flex justify-center -mt-1">
        <div className="h-1 w-10 rounded-full bg-foreground/20" />
      </div>

      <div className="rounded-2xl border border-foreground/8 bg-white shadow-sm">
        <div className="divide-y divide-foreground/[0.06]">
          {plannerStops.map((stop, index) => (
            <div key={stop.id} className="px-3 py-2.5 first:pt-3 last:pb-3">
              <PlannerStopEditor
                stop={stop}
                index={index}
                totalStops={plannerStops.length}
                pickingPoint={pickingPoint}
                userLocation={userLocation}
                allSavedLocations={allSavedLocations}
                handleSaveLocation={handleSaveLocation}
                isLocationSaved={isLocationSaved}
                onStartPicking={onStartPicking}
                onSetStopPoint={onSetStopPoint}
                onSetStopDepartureOverride={onSetStopDepartureOverride}
                onMoveStop={onMoveStop}
                onRemoveStop={onRemoveStop}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center border-t border-foreground/6 px-1.5 py-1.5">
          <button
            type="button"
            onClick={onAddStop}
            disabled={plannerStops.length >= 5}
            className="h-7 px-2 rounded-md text-[11px] font-medium text-foreground/50 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-foreground/[0.04] hover:text-foreground/70 flex items-center gap-1 transition-colors"
          >
            <Plus size={11} />
            Add stop
          </button>
          <button
            type="button"
            onClick={onReturnToStart}
            disabled={!origin || plannerStops.length >= 5}
            className="h-7 px-2 rounded-md text-[11px] font-medium text-foreground/50 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-foreground/[0.04] hover:text-foreground/70 flex items-center gap-1 transition-colors"
          >
            <CornerDownLeft size={11} />
            Return
          </button>
          {!isMultiStopJourney && (
            <button
              type="button"
              onClick={onSwapEndpoints}
              className="h-7 px-2 rounded-md text-[11px] font-medium text-foreground/50 hover:bg-foreground/[0.04] hover:text-foreground/70 flex items-center gap-1 transition-colors"
            >
              <ArrowUpDown size={11} />
              Swap
            </button>
          )}
          <button
            type="button"
            onClick={() => onClear?.()}
            className="h-7 px-2 rounded-md text-[11px] font-medium text-foreground/35 hover:bg-foreground/[0.04] hover:text-foreground/55 flex items-center gap-1 transition-colors ml-auto"
          >
            <Trash2 size={11} />
            Reset
          </button>
        </div>
      </div>

      <div className="space-y-2 md:space-y-2.5">
        <div className="flex items-center gap-2 md:gap-3">
          <select
            value={timeOption}
            onChange={(event) => onTimeOptionChange(event.target.value as TimeOption)}
            className="h-10 rounded-xl border border-foreground/10 bg-white px-3 text-sm text-foreground/80 font-medium focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all flex-1 min-w-0"
          >
            <option value="now">Leave now</option>
            <option value="depart">Depart at</option>
            <option value="arrive">Arrive by</option>
          </select>
          {!isMultiStopJourney && origin && destination && (
            <SavedPlannerPanel
              origin={origin}
              destination={destination}
              onSetOrigin={(place) => onSetStopPoint(plannerStops[0].id, place)}
              onSetDestination={(place) =>
                onSetStopPoint(plannerStops[plannerStops.length - 1].id, place)
              }
              saved={savedItems}
            />
          )}
          <Button
            size="sm"
            className="h-10 px-5 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl text-sm shadow-[0_8px_20px_-12px_rgba(0,96,255,0.8)] transition-all active:scale-[0.98] shrink-0"
            disabled={!canSearch}
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
            onChange={(event) => onDateTimeChange(event.target.value)}
            className="h-10 w-full rounded-xl border border-foreground/10 bg-white px-3 text-sm text-foreground/80 font-medium focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
          />
        )}
        {hasPlannerErrors && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-[12px] font-medium text-amber-700">
            Consecutive stops cannot be the same place.
          </div>
        )}
        {planError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-[12px] font-medium text-rose-700">
            {planError}
          </div>
        )}

        <div className="flex rounded-xl bg-foreground/4 p-[3px] gap-[3px]">
          {ROUTING_MODES.map((mode) => {
            const isActive = routingMode === mode.value;
            const IconComponent =
              mode.iconName === "zap"
                ? Zap
                : mode.iconName === "footprints"
                  ? Footprints
                  : ArrowRightLeft;
            return (
              <button
                key={mode.value}
                onClick={() => onSetRoutingMode(mode.value)}
                className={`flex-1 flex items-center justify-center gap-1.5 h-[34px] rounded-[9px] text-[11px] font-semibold tracking-tight transition-all duration-200 ${
                  isActive
                    ? "bg-white text-foreground/90 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_1px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.04]"
                    : "text-foreground/40 hover:text-foreground/60 active:bg-foreground/[0.03]"
                }`}
              >
                <IconComponent size={12} className={isActive ? "text-primary" : ""} strokeWidth={2.5} />
                <span>{mode.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MobileRouteDetailSheet({
  formBlock,
  routePlan,
  selectedRouteIndex,
  expandedRoute,
  handleRouteClick,
  onLocateVehicle,
  onReplan,
  noResults,
  onClose,
  reminderProps,
  transfersByArrivingLeg,
  mobileDetailRoute,
  detailSheetRef,
  isDetailDragging,
  detailDragY,
  beginDetailDrag,
  updateDetailDrag,
  endDetailDrag,
  closeMobileDetail,
  minutesUntil,
  isLiveAdjusted,
}: {
  formBlock: ReactNode;
  routePlan: RoutePlanResponse | null;
  selectedRouteIndex: number;
  expandedRoute: number | null;
  handleRouteClick: (index: number) => void;
  onLocateVehicle: (leg: RouteLeg) => void;
  onReplan?: () => void;
  noResults: boolean;
  onClose: () => void;
  reminderProps?: ReminderProps;
  transfersByArrivingLeg: Map<RouteLeg, TransferInfo>;
  mobileDetailRoute: PlannedRoute;
  detailSheetRef: RefObject<HTMLDivElement | null>;
  isDetailDragging: boolean;
  detailDragY: number;
  beginDetailDrag: (startY: number, startX?: number) => void;
  updateDetailDrag: (clientY: number, clientX?: number) => void;
  endDetailDrag: () => void;
  closeMobileDetail: () => void;
  minutesUntil: number | null;
  isLiveAdjusted: boolean;
}) {
  return (
    <>
      {desktopSidebar({
        formBlock,
        hasRoutes: !!routePlan?.routes?.length,
        routePlan,
        selectedRouteIndex,
        expandedRoute,
        handleRouteClick,
        onLocateVehicle,
        onReplan,
        noResults,
        onClose,
        reminderProps,
        transfersByArrivingLeg,
        isMultiStopJourney: false,
        multiRoutePlan: null,
      })}

      <div
        ref={detailSheetRef}
        className={`md:hidden absolute bottom-0 left-0 right-0 z-1100 bg-white rounded-t-3xl shadow-sheet border-t border-foreground/8 ${
          isDetailDragging ? "" : "transition-transform duration-250 ease-out"
        }`}
        style={{ transform: `translateY(${detailDragY}px)` }}
      >
        <div
          className="flex justify-center pt-2 pb-1 touch-none"
          onTouchStart={(event) => beginDetailDrag(event.touches[0].clientY)}
          onTouchMove={(event) => updateDetailDrag(event.touches[0].clientY)}
          onTouchEnd={endDetailDrag}
          onTouchCancel={endDetailDrag}
        >
          <div className="h-1 w-10 rounded-full bg-foreground/20" />
        </div>
        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-foreground/6">
          <button
            onClick={closeMobileDetail}
            className="h-8 w-8 rounded-full text-foreground/55 hover:text-foreground/75 hover:bg-foreground/6 active:bg-foreground/10 inline-flex items-center justify-center shrink-0 transition-colors"
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
          {reminderProps && (
            <button
              onClick={() => (reminderProps.isSet ? reminderProps.onClear() : reminderProps.onSchedule())}
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
          <StaleRouteBanner route={mobileDetailRoute} onReplan={onReplan} />
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
          {!reminderProps?.isSet && reminderProps?.status && (
            <div
              className={`px-3 py-2.5 rounded-xl border text-[11px] font-medium ${
                reminderProps.status.tone === "error"
                  ? "border-rose-200 bg-rose-50/80 text-rose-700"
                  : reminderProps.status.tone === "warning"
                    ? "border-amber-200 bg-amber-50/80 text-amber-700"
                    : "border-sky-200 bg-sky-50/80 text-sky-700"
              }`}
            >
              {reminderProps.status.message}
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

function MobilePlannerSheet({
  formBlock,
  isMultiStopJourney,
  multiHasResults,
  multiRoutePlan,
  plannerStops,
  noResults,
  hasRoutes,
  routePlan,
  selectedRouteIndex,
  handleMobileRouteClick,
  onLocateVehicle,
  isFullDragging,
  fullDragY,
  beginFullDrag,
  updateFullDrag,
  endFullDrag,
}: {
  formBlock: ReactNode;
  isMultiStopJourney: boolean;
  multiHasResults: boolean;
  multiRoutePlan: MultiRoutePlanResponse | null;
  plannerStops: PlannerStop[];
  noResults: boolean;
  hasRoutes: boolean;
  routePlan: RoutePlanResponse | null;
  selectedRouteIndex: number;
  handleMobileRouteClick: (index: number) => void;
  onLocateVehicle: (leg: RouteLeg) => void;
  isFullDragging: boolean;
  fullDragY: number;
  beginFullDrag: (startY: number, startX?: number) => void;
  updateFullDrag: (clientY: number, clientX?: number) => void;
  endFullDrag: () => void;
}) {
  const [mobileEditorExpanded, setMobileEditorExpanded] = useState(false);

  return (
    <div
      className={`md:hidden absolute inset-0 z-1100 flex flex-col bg-white ${
        isFullDragging ? "" : "transition-transform duration-250 ease-out"
      }`}
      style={{ transform: `translateY(${fullDragY}px)` }}
      onTouchStart={(event) => beginFullDrag(event.touches[0].clientY, event.touches[0].clientX)}
      onTouchMove={(event) => updateFullDrag(event.touches[0].clientY, event.touches[0].clientX)}
      onTouchEnd={endFullDrag}
      onTouchCancel={endFullDrag}
    >
      {isMultiStopJourney && multiHasResults ? (
        <div className="px-4 pt-4 pb-2">
          <button
            type="button"
            onClick={() => setMobileEditorExpanded((value) => !value)}
            className="w-full rounded-2xl border border-foreground/8 bg-white px-4 py-3 text-left shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.2em] text-foreground/40 font-semibold">
                  {mobileEditorExpanded ? "Hide editor" : "Edit itinerary"}
                </div>
                <div className="mt-1 text-sm font-semibold text-foreground/80 truncate">
                  {plannerStops
                    .map((stop, index) => stop.point?.name || stopPlaceholder(index, plannerStops.length))
                    .join(" · ")}
                </div>
              </div>
              {mobileEditorExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>
          </button>
        </div>
      ) : null}

      {(!isMultiStopJourney || !multiHasResults || mobileEditorExpanded) && formBlock}

      <div className="h-px bg-foreground/6" />

      <div className="flex-1 min-h-0 overflow-y-auto pb-20">
        {isMultiStopJourney ? (
          <div className="p-3 space-y-3">
            <MultiRouteResults
              key={
                multiRoutePlan?.itinerary?.startTime ??
                `failure-${multiRoutePlan?.failedSegment?.segmentIndex ?? "none"}`
              }
              plan={multiRoutePlan}
              onLocateVehicle={onLocateVehicle}
            />
            {noResults && (
              <NoRoutesMessage className="px-4 py-12 text-center text-sm text-foreground/55 font-medium" />
            )}
          </div>
        ) : (
          <>
            {hasRoutes && routePlan && (
              <div className="p-3 space-y-2.5">
                {routePlan.routes.map((route, index) => (
                  <MobileRouteOption
                    key={getRouteKey(route, index)}
                    route={route}
                    isSelected={index === selectedRouteIndex}
                    onClick={() => handleMobileRouteClick(index)}
                  />
                ))}
              </div>
            )}
            {noResults && (
              <NoRoutesMessage className="px-4 py-12 text-center text-sm text-foreground/55 font-medium" />
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface RoutePlannerProps {
  userLocation: { lat: number; lng: number } | null;
  plannerStops: PlannerStop[];
  pickingPoint: string | null;
  onStartPicking: (stopId: string | null) => void;
  onSetStopPoint: (stopId: string, place: { lat: number; lng: number; name?: string }) => void;
  onSetStopDepartureOverride: (stopId: string, departureOverride: string) => void;
  onAddStop: () => void;
  onMoveStop: (stopId: string, direction: -1 | 1) => void;
  onRemoveStop: (stopId: string) => void;
  onReturnToStart: () => void;
  onPlanRoute: () => void;
  routePlan: RoutePlanResponse | null;
  multiRoutePlan: MultiRoutePlanResponse | null;
  planError?: string | null;
  planLoading: boolean;
  selectedRouteIndex: number;
  onSelectRoute: (index: number) => void;
  onClose: () => void;
  onLocateVehicle: (leg: RouteLeg) => void;
  timeOption: TimeOption;
  onTimeOptionChange: (option: TimeOption) => void;
  selectedDateTime: string;
  onDateTimeChange: (dateTime: string) => void;
  onSwapEndpoints: () => void;
  onClear?: () => void;
  openSelectedRouteDetails?: boolean;
  onConsumeOpenSelectedRouteDetails?: () => void;
  hasSearchedCurrentDraft: boolean;
}

export function RoutePlanner({
  userLocation,
  plannerStops,
  pickingPoint,
  onStartPicking,
  onSetStopPoint,
  onSetStopDepartureOverride,
  onAddStop,
  onMoveStop,
  onRemoveStop,
  onReturnToStart,
  onPlanRoute,
  routePlan,
  multiRoutePlan,
  planError = null,
  planLoading,
  selectedRouteIndex,
  onSelectRoute,
  onClose,
  onLocateVehicle,
  timeOption,
  onTimeOptionChange,
  selectedDateTime,
  onDateTimeChange,
  onSwapEndpoints,
  onClear,
  openSelectedRouteDetails = false,
  onConsumeOpenSelectedRouteDetails,
  hasSearchedCurrentDraft,
}: RoutePlannerProps) {
  const routingMode = useTransitStore((state) => state.routingMode);
  const setRoutingMode = useTransitStore((state) => state.setRoutingMode);
  const isMultiStopJourney = plannerStops.length > 2;
  const hasPlannerErrors = hasConsecutiveDuplicateStops(plannerStops);
  const hasValidScheduledTime = timeOption === "now" || selectedDateTime.trim().length > 0;
  const canSearch =
    hasResolvedStops(plannerStops) && !hasPlannerErrors && hasValidScheduledTime && !planLoading;
  const hasRoutes = !isMultiStopJourney && !!routePlan?.routes?.length;
  const multiHasResults = !!multiRoutePlan?.itinerary || !!multiRoutePlan?.failedSegment;

  const {
    expandedRoute,
    selectedRoute,
    mobileDetailRoute,
    detailSheetRef,
    handleRouteClick,
    handleMobileRouteClick,
    closeMobileDetail,
  } = useRoutePlannerSelection({
    routePlan: isMultiStopJourney ? null : routePlan,
    selectedRouteIndex,
    onSelectRoute,
    openSelectedRouteDetails: isMultiStopJourney ? false : openSelectedRouteDetails,
    onConsumeOpenSelectedRouteDetails,
  });
  const { savedItems, allSavedLocations, isLocationSaved, handleSaveLocation } =
    usePlannerSavedLocations();
  const { transfersByArrivingLeg, reminderProps, isLiveAdjusted, minutesUntil } =
    useRoutePlannerInsights(selectedRoute);

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
    onDismiss: closeMobileDetail,
  });

  const setRestoredFromSnapshot = useTransitStore((state) => state.setRestoredFromSnapshot);
  const handleReplan = () => {
    setRestoredFromSnapshot(false);
    onPlanRoute();
  };

  const origin = plannerStops[0]?.point ?? null;
  const destination = plannerStops[plannerStops.length - 1]?.point ?? null;
  const formBlock = (
    <RoutePlannerFormBlock
      plannerStops={plannerStops}
      pickingPoint={pickingPoint}
      userLocation={userLocation}
      allSavedLocations={allSavedLocations}
      handleSaveLocation={handleSaveLocation}
      isLocationSaved={isLocationSaved}
      onStartPicking={onStartPicking}
      onSetStopPoint={onSetStopPoint}
      onSetStopDepartureOverride={onSetStopDepartureOverride}
      onMoveStop={onMoveStop}
      onRemoveStop={onRemoveStop}
      onAddStop={onAddStop}
      onReturnToStart={onReturnToStart}
      onSwapEndpoints={onSwapEndpoints}
      onClear={onClear}
      origin={origin}
      destination={destination}
      isMultiStopJourney={isMultiStopJourney}
      savedItems={savedItems}
      canSearch={canSearch}
      planLoading={planLoading}
      onPlanRoute={onPlanRoute}
      timeOption={timeOption}
      onTimeOptionChange={onTimeOptionChange}
      selectedDateTime={selectedDateTime}
      onDateTimeChange={onDateTimeChange}
      hasPlannerErrors={hasPlannerErrors}
      planError={planError}
      routingMode={routingMode}
      onSetRoutingMode={setRoutingMode}
    />
  );

  const noResults =
    hasSearchedCurrentDraft &&
    !planLoading &&
    !planError &&
    (isMultiStopJourney ? !multiHasResults : routePlan?.routes?.length === 0);

  if (!isMultiStopJourney && mobileDetailRoute) {
    return (
      <MobileRouteDetailSheet
        formBlock={formBlock}
        routePlan={routePlan}
        selectedRouteIndex={selectedRouteIndex}
        expandedRoute={expandedRoute}
        handleRouteClick={handleRouteClick}
        onLocateVehicle={onLocateVehicle}
        onReplan={handleReplan}
        noResults={noResults}
        onClose={onClose}
        reminderProps={reminderProps}
        transfersByArrivingLeg={transfersByArrivingLeg}
        mobileDetailRoute={mobileDetailRoute}
        detailSheetRef={detailSheetRef}
        isDetailDragging={isDetailDragging}
        detailDragY={detailDragY}
        beginDetailDrag={beginDetailDrag}
        updateDetailDrag={updateDetailDrag}
        endDetailDrag={endDetailDrag}
        closeMobileDetail={closeMobileDetail}
        minutesUntil={minutesUntil}
        isLiveAdjusted={isLiveAdjusted}
      />
    );
  }

  return (
    <>
      {desktopSidebar({
        formBlock,
        hasRoutes,
        routePlan,
        selectedRouteIndex,
        expandedRoute,
        handleRouteClick,
        onLocateVehicle,
        onReplan: handleReplan,
        noResults,
        onClose,
        reminderProps,
        transfersByArrivingLeg,
        isMultiStopJourney,
        multiRoutePlan,
      })}

      <MobilePlannerSheet
        formBlock={formBlock}
        isMultiStopJourney={isMultiStopJourney}
        multiHasResults={multiHasResults}
        multiRoutePlan={multiRoutePlan}
        plannerStops={plannerStops}
        noResults={noResults}
        hasRoutes={hasRoutes}
        routePlan={routePlan}
        selectedRouteIndex={selectedRouteIndex}
        handleMobileRouteClick={handleMobileRouteClick}
        onLocateVehicle={onLocateVehicle}
        isFullDragging={isFullDragging}
        fullDragY={fullDragY}
        beginFullDrag={beginFullDrag}
        updateFullDrag={updateFullDrag}
        endFullDrag={endFullDrag}
      />
    </>
  );
}
