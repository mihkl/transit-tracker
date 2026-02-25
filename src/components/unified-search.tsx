"use client";

import { useState, useRef, useCallback } from "react";
import { useClickOutside } from "@/hooks/use-click-outside";
import { Search } from "lucide-react";
import type { LineDto, StopDto } from "@/lib/types";
import { useStops } from "@/hooks/use-stops";
import { useTransitStore } from "@/store/use-transit-store";
import { useTransitSearch } from "@/hooks/use-transit-search";
import { ActiveFilterPill } from "@/components/search/active-filter-pill";
import { SearchResultsList } from "@/components/search/search-results-list";

interface UnifiedSearchProps {
  lines: LineDto[];
  vehicleCount: number;
  embedded?: boolean;
}

export function UnifiedSearch({
  lines,
  vehicleCount,
  embedded = false,
}: UnifiedSearchProps) {
  const selectedLine = useTransitStore((s) => s.selectedLine);
  const selectedStop = useTransitStore((s) => s.selectedStop);
  const setSelectedLine = useTransitStore((s) => s.setSelectedLine);
  const setSelectedStop = useTransitStore((s) => s.setSelectedStop);
  const [query, setQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const { stops } = useStops();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasActiveFilter = !!(selectedLine || selectedStop);

  const { groupedLines, filteredStops, showAllTrains, hasAnyResults } = useTransitSearch({
    lines,
    stops,
    query,
  });

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setShowDropdown(true);
  };

  const handleSelectLine = (line: LineDto) => {
    setQuery("");
    setShowDropdown(false);
    setSelectedStop(null);
    setSelectedLine({ lineNumber: line.lineNumber, type: line.type });
  };

  const handleSelectAllTrains = () => {
    setQuery("");
    setShowDropdown(false);
    setSelectedStop(null);
    setSelectedLine({ lineNumber: "", type: "train" });
  };

  const handleSelectStop = (stop: StopDto) => {
    setQuery("");
    setShowDropdown(false);
    setSelectedLine(null);
    setSelectedStop(stop);
  };

  const handleClearFilter = () => {
    setSelectedLine(null);
    setSelectedStop(null);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const closeDropdown = useCallback(() => setShowDropdown(false), []);
  useClickOutside(wrapperRef, closeDropdown);

  // Active filter pill
  if (hasActiveFilter) {
    return (
      <div ref={wrapperRef} className={embedded ? "" : "bg-white shadow-panel rounded-2xl"}>
        <ActiveFilterPill
          selectedLine={selectedLine}
          selectedStop={selectedStop}
          vehicleCount={vehicleCount}
          onClear={handleClearFilter}
          variant="desktop"
        />
      </div>
    );
  }

  // Search input
  return (
    <div className="relative" ref={wrapperRef}>
      <div
        className={`relative flex items-center h-10 rounded-2xl ${
          embedded ? "bg-foreground/6" : "bg-white shadow-panel"
        }`}
      >
        <Search size={15} className="absolute left-3.5 text-foreground/40 pointer-events-none" />
        <input
          ref={inputRef}
          className="w-full h-full pl-10 pr-4 text-sm font-medium bg-transparent rounded-2xl outline-none placeholder:text-foreground/45 text-foreground/85"
          type="text"
          placeholder="Search lines or stops..."
          value={query}
          onChange={handleInput}
          onFocus={() => setShowDropdown(true)}
        />
      </div>

      {showDropdown && (
        <div className="fixed left-3 right-3 top-[3.75rem] z-[1100] md:absolute md:top-full md:left-0 md:right-auto md:mt-2 md:w-72 animate-scale-in pointer-events-auto bg-white rounded-xl shadow-dropdown max-h-[60vh] overflow-hidden">
          <div className="max-h-[inherit] overflow-y-auto overscroll-contain">
            <SearchResultsList
              query={query}
              groupedLines={groupedLines}
              filteredStops={filteredStops}
              showAllTrains={showAllTrains}
              hasAnyResults={hasAnyResults}
              onSelectLine={handleSelectLine}
              onSelectAllTrains={handleSelectAllTrains}
              onSelectStop={handleSelectStop}
              variant="desktop"
            />
          </div>
        </div>
      )}
    </div>
  );
}
