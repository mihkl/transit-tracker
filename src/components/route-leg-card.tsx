"use client";

import type { RouteLeg } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { formatDuration, formatDelay, formatTime } from "@/lib/format-utils";
import { MODE_COLORS, MODE_LABELS, DELAY_COLORS } from "@/lib/constants";

interface RouteLegCardProps {
  leg: RouteLeg;
  onLocateVehicle?: (leg: RouteLeg) => void;
}

export function RouteLegCard({ leg, onLocateVehicle }: RouteLegCardProps) {
  const isTransit = leg.mode !== "WALK" && !!leg.lineNumber;
  const depTime = formatTime(leg.scheduledDeparture);
  const arrTime = formatTime(leg.scheduledArrival);
  const color = MODE_COLORS[leg.mode] || "#999";

  if (leg.mode === "WALK") {
    return (
      <div className="flex items-center gap-3 px-2 py-1.5">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#999"
          strokeWidth="2"
          className="shrink-0"
        >
          <circle cx="12" cy="5" r="2" />
          <path d="M10 22l2-7 3 3v6M10.5 11l2.5-3 3.5 2" />
        </svg>
        <span className="text-xs text-gray-500">
          Walk {formatDuration(leg.duration)}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border border-gray-200 bg-white px-3 py-2.5 ${isTransit ? "cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors" : ""}`}
      onClick={() => {
        if (isTransit && onLocateVehicle) {
          onLocateVehicle(leg);
        }
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-xs font-semibold text-white"
          style={{ backgroundColor: color }}
        >
          {leg.lineNumber || MODE_LABELS[leg.mode] || leg.mode}
        </span>
        <span className="text-xs text-gray-500">
          {formatDuration(leg.duration)}
          {leg.numStops != null && ` · ${leg.numStops} stops`}
        </span>
        {leg.delay && leg.delay.status !== "unknown" && (
          <Badge
            className="text-white text-[10px] ml-auto px-1.5 py-0"
            style={{
              backgroundColor: DELAY_COLORS[leg.delay.status] || "#999",
            }}
          >
            {formatDelay(leg.delay.estimatedDelaySeconds)}
          </Badge>
        )}
      </div>

      <div className="mt-2 ml-0.5 flex gap-2.5">
        <div className="flex flex-col items-center w-3 shrink-0 py-0.5">
          <div
            className="w-2 h-2 rounded-full border-2 shrink-0"
            style={{ borderColor: color }}
          />
          <div
            className="flex-1 w-0.5 my-0.5"
            style={{ backgroundColor: color, opacity: 0.3 }}
          />
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: color }}
          />
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-between gap-1">
          {leg.departureStop && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-gray-700 truncate">
                {leg.departureStop}
              </span>
              {depTime && (
                <span className="text-xs text-gray-400 font-mono shrink-0 tabular-nums">
                  {depTime}
                </span>
              )}
            </div>
          )}
          {leg.arrivalStop && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-gray-700 truncate">
                {leg.arrivalStop}
              </span>
              {arrTime && (
                <span className="text-xs text-gray-400 font-mono shrink-0 tabular-nums">
                  {arrTime}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {isTransit && (
        <div className="mt-1.5 text-[11px] text-gray-400">
          Tap to see vehicles on line
        </div>
      )}
    </div>
  );
}
