"use client";

import { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import type { LineDto, StopDto } from "@/lib/types";
import { useStops } from "@/hooks/use-stops";
import { useTransitStore } from "@/store/use-transit-store";
import { useTransitSearch } from "@/hooks/use-transit-search";
import { ActiveFilterPill } from "@/components/search/active-filter-pill";
import { SearchResultsList } from "@/components/search/search-results-list";
import { useDragDismiss } from "@/hooks/use-drag-dismiss";

interface MobileSearchViewProps {
  lines: LineDto[];
  vehicleCount: number;
}

export function MobileSearchView({
  lines,
  vehicleCount,
}: MobileSearchViewProps) {
  const selectedLine = useTransitStore((s) => s.selectedLine);
  const selectedStop = useTransitStore((s) => s.selectedStop);
  const setSelectedLine = useTransitStore((s) => s.setSelectedLine);
  const setSelectedStop = useTransitStore((s) => s.setSelectedStop);
  const setShowVehicles = useTransitStore((s) => s.setShowVehicles);
  const goToMapTab = useTransitStore((s) => s.goToMapTab);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { stops } = useStops();
  const { dragY, isDragging, beginDrag, updateDrag, endDrag } = useDragDismiss({
    thresholdPx: 130,
    velocityThreshold: 0.8,
    onDismiss: goToMapTab,
    maxStartY: 140,
    axisLockRatio: 1.2,
  });

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  const { groupedLines, filteredStops, showAllTrains, hasAnyResults } = useTransitSearch({
    lines,
    stops,
    query,
  });

  const hasActiveFilter = !!(selectedLine || selectedStop);

  const handleSelectLine = (line: LineDto) => {
    setSelectedStop(null);
    setSelectedLine({ lineNumber: line.lineNumber, type: line.type });
    setShowVehicles(true);
    goToMapTab();
  };

  const handleSelectAllTrains = () => {
    setSelectedStop(null);
    setSelectedLine({ lineNumber: "", type: "train" });
    setShowVehicles(true);
    goToMapTab();
  };

  const handleSelectStop = (stop: StopDto) => {
    setSelectedLine(null);
    setSelectedStop(stop);
    goToMapTab();
  };

  const handleClearFilter = () => {
    setSelectedLine(null);
    setSelectedStop(null);
    setQuery("");
    inputRef.current?.focus();
  };

  return (
    <div
      className={`h-full flex flex-col bg-white ${isDragging ? "" : "transition-transform duration-250 ease-out"}`}
      style={{ transform: `translateY(${dragY}px)` }}
      onTouchStart={(e) => beginDrag(e.touches[0].clientY, e.touches[0].clientX)}
      onTouchMove={(e) => updateDrag(e.touches[0].clientY, e.touches[0].clientX)}
      onTouchEnd={endDrag}
      onTouchCancel={endDrag}
    >
      {/* Header + search input */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <div className="flex justify-center pb-2 touch-none">
          <div className="w-10 h-1 rounded-full bg-foreground/20" />
        </div>
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-foreground/35 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search lines or stops..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full h-12 pl-14 pr-10 rounded-2xl bg-foreground/[0.05] text-[16px] font-medium outline-none placeholder:text-foreground/40"
          />
          {query && (
            <button
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full hover:bg-foreground/10"
            >
              <X className="w-4 h-4 text-foreground/40" />
            </button>
          )}
        </div>
      </div>

      {/* Active filter pill */}
      {hasActiveFilter && (
        <div className="px-4 pb-2">
          <ActiveFilterPill
            selectedLine={selectedLine}
            selectedStop={selectedStop}
            vehicleCount={vehicleCount}
            onClear={handleClearFilter}
            variant="mobile"
          />
        </div>
      )}

      {/* Results */}
      <div className="flex-1 min-h-0 overflow-y-auto pb-20">
        <SearchResultsList
          query={query}
          groupedLines={groupedLines}
          filteredStops={filteredStops}
          showAllTrains={showAllTrains}
          hasAnyResults={hasAnyResults}
          onSelectLine={handleSelectLine}
          onSelectAllTrains={handleSelectAllTrains}
          onSelectStop={handleSelectStop}
          variant="mobile"
        />
      </div>
    </div>
  );
}
