"use client";

import { LineSearchInput } from "@/components/line-search-input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface FilterPanelProps {
  selectedLine: { lineNumber: string; type: string } | null;
  onLineSelect: (line: { lineNumber: string; type: string } | null) => void;
  vehicleCount: number;
  lastUpdate: Date | null;
  showPlanner: boolean;
  onTogglePlanner: () => void;
}

export function FilterPanel({
  selectedLine,
  onLineSelect,
  vehicleCount,
  lastUpdate,
  showPlanner,
  onTogglePlanner,
}: FilterPanelProps) {
  return (
    <div className="relative z-[1000] flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border bg-card sm:gap-3 sm:px-4">
      <LineSearchInput value={selectedLine} onSelect={onLineSelect} />

      <Button
        variant={showPlanner ? "secondary" : "outline"}
        size="sm"
        className="h-8 text-xs sm:text-sm"
        onClick={onTogglePlanner}
      >
        Route
      </Button>

      <div className="flex items-center gap-2 ml-auto">
        <Badge variant="secondary" className="font-mono text-xs">
          {vehicleCount}
        </Badge>
        {lastUpdate && (
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {lastUpdate.toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}
