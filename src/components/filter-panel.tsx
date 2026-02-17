"use client";

import { LineSearchInput } from "@/components/line-search-input";
import { StopSearchInput } from "@/components/stop-search-input";
import { Button } from "@/components/ui/button";
import { Car } from "lucide-react";
import { Icon } from "@/components/icon";
import type { StopDto, LineDto } from "@/lib/types";

interface FilterPanelProps {
  selectedLine: { lineNumber: string; type: string } | null;
  onLineSelect: (line: { lineNumber: string; type: string } | null) => void;
  selectedStop: StopDto | null;
  onStopSelect: (stop: StopDto | null) => void;
  vehicleCount: number;
  lastUpdate: Date | null;
  onTogglePlanner: () => void;
  showTraffic?: boolean;
  onToggleTraffic?: () => void;
  lines: LineDto[];
}

export function FilterPanel({
  selectedLine,
  onLineSelect,
  selectedStop,
  onStopSelect,
  vehicleCount,
  lastUpdate,
  onTogglePlanner,
  showTraffic = false,
  onToggleTraffic,
  lines,
}: FilterPanelProps) {
  return (
    <>
      <div className="absolute top-3 left-3 right-3 z-1000 md:hidden">
        <div className="flex items-center gap-1.5 px-2 py-2.5 bg-white rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.12),0_0_1px_rgba(0,0,0,0.08)] overflow-hidden">
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <LineSearchInput
              value={selectedLine}
              onSelect={onLineSelect}
              lines={lines}
            />
            <StopSearchInput value={selectedStop} onSelect={onStopSelect} />
          </div>

          {onToggleTraffic && (
            <Button
              variant={showTraffic ? "default" : "ghost"}
              size="sm"
              className="h-9 px-2 text-sm font-medium"
              onClick={onToggleTraffic}
              title="Toggle traffic overlay"
            >
              <Car className="w-4 h-4" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="h-9 px-3 text-sm font-medium hover:bg-gray-100"
            onClick={onTogglePlanner}
          >
            <Icon name="arrow-right" className="w-4 h-4 mr-1.5" />
            <span className="hidden sm:inline">Directions</span>
          </Button>

          <div className="shrink-0 flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-full">
            <span className="text-xs font-medium text-gray-600 tabular-nums">
              {vehicleCount}
            </span>
          </div>
        </div>
      </div>

      <div className="hidden md:flex absolute top-3 right-3 z-1000 items-center gap-2 px-3 py-2.5 bg-white rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.12),0_0_1px_rgba(0,0,0,0.08)]">
        <LineSearchInput
          value={selectedLine}
          onSelect={onLineSelect}
          lines={lines}
        />
        <StopSearchInput value={selectedStop} onSelect={onStopSelect} />

        <div className="w-px h-6 bg-gray-200" />

        {onToggleTraffic && (
          <Button
            variant={showTraffic ? "default" : "ghost"}
            size="sm"
            className="h-9 px-3 text-sm font-medium"
            onClick={onToggleTraffic}
            title="Toggle traffic overlay"
          >
            <Car className="w-4 h-4 mr-1.5" />
            Traffic
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-3 text-sm font-medium hover:bg-gray-100"
          onClick={onTogglePlanner}
        >
          <Icon name="arrow-right" className="w-4 h-4 mr-1.5" />
          Directions
        </Button>

        <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-full">
          <span className="text-xs font-medium text-gray-600">
            {vehicleCount}
          </span>
          <span className="text-[10px] text-gray-400">vehicles</span>
        </div>
        {lastUpdate && (
          <span className="text-[11px] text-gray-400 tabular-nums">
            {lastUpdate.toLocaleTimeString()}
          </span>
        )}
      </div>
    </>
  );
}
