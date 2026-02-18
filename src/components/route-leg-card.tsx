"use client";

import { Footprints } from "lucide-react";
import type { RouteLeg } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { formatDuration, formatDelay, formatTime } from "@/lib/format-utils";
import { getTransportColor, MODE_LABELS, DELAY_COLORS } from "@/lib/constants";

interface RouteLegCardProps {
  leg: RouteLeg;
  onLocateVehicle?: (leg: RouteLeg) => void;
}

export function RouteLegCard({ leg, onLocateVehicle }: RouteLegCardProps) {
  const isTransit = leg.mode !== "WALK" && !!leg.lineNumber;
  const depTime = formatTime(leg.scheduledDeparture);
  const arrTime = formatTime(leg.scheduledArrival);
  const color = getTransportColor(leg.mode);

  if (leg.mode === "WALK") {
    return (
      <div className="flex items-center gap-3 px-2 py-2">
        <Footprints size={15} className="shrink-0 text-foreground/50" />
        <span className="text-xs text-foreground/60 font-semibold">
          Walk {formatDuration(leg.duration)}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-foreground/8 bg-white px-3 py-3 transition-all duration-150 ${
        isTransit
          ? "cursor-pointer hover:bg-foreground/[0.02] active:scale-[0.99]"
          : ""
      }`}
      style={{ borderLeftWidth: 3, borderLeftColor: color }}
      onClick={() => {
        if (isTransit && onLocateVehicle) onLocateVehicle(leg);
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {leg.lineNumber || MODE_LABELS[leg.mode] || leg.mode}
        </span>
        <span className="text-xs text-foreground/65 font-semibold">
          {formatDuration(leg.duration)}
          {leg.numStops != null && ` · ${leg.numStops} stops`}
        </span>
        {leg.delay && leg.delay.status !== "unknown" && (
          <Badge
            className="text-white text-[10px] ml-auto px-1.5 py-0 font-bold rounded-md"
            style={{
              backgroundColor: DELAY_COLORS[leg.delay.status] || "#999",
            }}
          >
            {formatDelay(leg.delay.estimatedDelaySeconds)}
          </Badge>
        )}
      </div>

      <div className="mt-2.5 ml-0.5 flex gap-2.5">
        <div className="flex flex-col items-center w-3 shrink-0 py-0.5">
          <div
            className="w-2 h-2 rounded-full border-2 shrink-0"
            style={{ borderColor: color }}
          />
          <div
            className="flex-1 w-0.5 my-0.5 rounded-full"
            style={{ backgroundColor: color, opacity: 0.3 }}
          />
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: color }}
          />
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-between gap-1.5">
          {leg.departureStop && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-foreground/80 font-medium truncate">
                {leg.departureStop}
              </span>
              {depTime && (
                <span className="text-xs text-foreground/60 font-mono shrink-0 tabular-nums font-semibold">
                  {depTime}
                </span>
              )}
            </div>
          )}
          {leg.arrivalStop && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-foreground/80 font-medium truncate">
                {leg.arrivalStop}
              </span>
              {arrTime && (
                <span className="text-xs text-foreground/60 font-mono shrink-0 tabular-nums font-semibold">
                  {arrTime}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {isTransit && (
        <div className="mt-2 text-[11px] text-foreground/45 font-medium">
          Tap to locate on map
        </div>
      )}
    </div>
  );
}
