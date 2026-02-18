"use client";

import { UnifiedSearch } from "@/components/unified-search";
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
  onTogglePlanner,
  showTraffic = false,
  onToggleTraffic,
  lines,
}: FilterPanelProps) {
  return (
    <>
      {/* Mobile — just the search bar, clean and minimal */}
      <div className="absolute top-3 left-3 right-3 z-1000 md:hidden">
        <UnifiedSearch
          lines={lines}
          selectedLine={selectedLine}
          onLineSelect={onLineSelect}
          selectedStop={selectedStop}
          onStopSelect={onStopSelect}
          vehicleCount={vehicleCount}
        />
      </div>

      {/* Desktop — search bar + controls in one row */}
      <div className="hidden md:flex absolute top-3 right-3 z-1000 items-center gap-2 px-2 py-1.5 bg-white rounded-2xl shadow-panel">
        <div className="w-64">
          <UnifiedSearch
            lines={lines}
            selectedLine={selectedLine}
            onLineSelect={onLineSelect}
            selectedStop={selectedStop}
            onStopSelect={onStopSelect}
            vehicleCount={vehicleCount}
            embedded
          />
        </div>

        <div className="w-px h-5 bg-foreground/6" />

        {onToggleTraffic && (
          <Button
            variant={showTraffic ? "default" : "ghost"}
            size="sm"
            className="h-8 px-2.5 rounded-xl text-sm font-medium"
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
          className="h-8 px-2.5 rounded-xl text-sm font-medium"
          onClick={onTogglePlanner}
        >
          <Icon name="arrow-right" className="w-4 h-4 mr-1.5" />
          Directions
        </Button>

        <div className="w-px h-5 bg-foreground/6" />

        <div className="flex items-center gap-1.5 px-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-live shrink-0" />
          <span className="text-[11px] text-foreground/45 font-medium">
            live
          </span>
        </div>
      </div>
    </>
  );
}
