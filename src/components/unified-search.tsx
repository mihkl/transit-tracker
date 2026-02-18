"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useClickOutside } from "@/hooks/use-click-outside";
import { Search, MapPin, X } from "lucide-react";
import { TypeIcon } from "@/components/line-search-input";
import { TYPE_LABELS, TYPE_COLORS } from "@/lib/constants";
import type { LineDto, StopDto } from "@/lib/types";

const TYPE_ORDER = ["train", "tram", "trolleybus", "bus"];

const STOP_TYPE_COLORS: Record<string, string> = {
  B: "#2196F3",
  T: "#F44336",
  t: "#4CAF50",
  K: "#FF9800",
};

interface UnifiedSearchProps {
  lines: LineDto[];
  selectedLine: { lineNumber: string; type: string } | null;
  onLineSelect: (line: { lineNumber: string; type: string } | null) => void;
  selectedStop: StopDto | null;
  onStopSelect: (stop: StopDto | null) => void;
  vehicleCount: number;
  embedded?: boolean;
}

export function UnifiedSearch({
  lines,
  selectedLine,
  onLineSelect,
  selectedStop,
  onStopSelect,
  vehicleCount,
  embedded = false,
}: UnifiedSearchProps) {
  const [query, setQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [stops, setStops] = useState<StopDto[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasActiveFilter = !!(selectedLine || selectedStop);

  // Load stops on mount
  useEffect(() => {
    fetch("/api/all-stops")
      .then((r) => r.json())
      .then((data: StopDto[]) => setStops(data))
      .catch((err) => console.error("Failed to load stops:", err));
  }, []);

  // Unique lines
  const uniqueLines = useMemo(() => {
    const seen = new Set<string>();
    return lines.filter((l) => {
      const key = `${l.type}_${l.lineNumber}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [lines]);

  // Filtered lines
  const filteredLines = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return uniqueLines;
    return uniqueLines.filter(
      (l) =>
        l.lineNumber.toLowerCase().includes(q) ||
        (TYPE_LABELS[l.type] ?? l.type).toLowerCase().includes(q),
    );
  }, [uniqueLines, query]);

  // Grouped lines
  const groupedLines = useMemo(() => {
    const groups: Record<string, LineDto[]> = {};
    for (const line of filteredLines) {
      if (!groups[line.type]) groups[line.type] = [];
      groups[line.type].push(line);
    }
    for (const type of Object.keys(groups)) {
      groups[type].sort((a, b) => {
        const na = parseInt(a.lineNumber, 10);
        const nb = parseInt(b.lineNumber, 10);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.lineNumber.localeCompare(b.lineNumber);
      });
    }
    return groups;
  }, [filteredLines]);

  // Filtered stops
  const filteredStops = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return stops
      .filter((s) => s.stopName.toLowerCase().includes(q))
      .slice(0, 8);
  }, [stops, query]);

  // Show "All Trains" option
  const showAllTrains = useMemo(() => {
    const q = query.trim().toLowerCase();
    return !q || "all trains".includes(q) || "train".includes(q);
  }, [query]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setShowDropdown(true);
  };

  const handleSelectLine = (line: LineDto) => {
    setQuery("");
    setShowDropdown(false);
    onStopSelect(null);
    onLineSelect({ lineNumber: line.lineNumber, type: line.type });
  };

  const handleSelectAllTrains = () => {
    setQuery("");
    setShowDropdown(false);
    onStopSelect(null);
    onLineSelect({ lineNumber: "", type: "train" });
  };

  const handleSelectStop = (stop: StopDto) => {
    setQuery("");
    setShowDropdown(false);
    onLineSelect(null);
    onStopSelect(stop);
  };

  const handleClearFilter = () => {
    onLineSelect(null);
    onStopSelect(null);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const closeDropdown = useCallback(() => setShowDropdown(false), []);
  useClickOutside(wrapperRef, closeDropdown);

  const hasLineResults = TYPE_ORDER.some(
    (type) => type !== "train" && groupedLines[type]?.length,
  );
  const hasStopResults = filteredStops.length > 0;
  const hasAnyResults = hasLineResults || hasStopResults || showAllTrains;

  // Active filter pill
  if (hasActiveFilter) {
    const color = selectedLine
      ? TYPE_COLORS[selectedLine.type] || TYPE_COLORS.unknown
      : undefined;
    const label = selectedLine
      ? selectedLine.lineNumber
        ? `${TYPE_LABELS[selectedLine.type] ?? selectedLine.type} ${selectedLine.lineNumber}`
        : "All Trains"
      : selectedStop?.stopName ?? "";

    return (
      <div
        className={`flex items-center gap-2 h-10 px-3 rounded-2xl cursor-default min-w-0 ${
          embedded
            ? "bg-foreground/6"
            : "bg-white shadow-panel"
        }`}
        ref={wrapperRef}
      >
        {selectedLine ? (
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: color }}
          />
        ) : (
          <MapPin size={14} className="text-foreground/50 shrink-0" />
        )}
        <span className="text-sm font-semibold text-foreground/85 truncate">
          {label}
        </span>
        {selectedLine && (
          <>
            <span className="text-foreground/25 font-medium">·</span>
            <span className="text-xs font-semibold text-foreground/55 tabular-nums whitespace-nowrap">
              {vehicleCount} live
            </span>
          </>
        )}
        <button
          onClick={handleClearFilter}
          className="ml-auto p-0.5 rounded-full hover:bg-foreground/8 text-foreground/40 hover:text-foreground/70 transition-colors shrink-0"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  // Search input
  return (
    <div className="relative" ref={wrapperRef}>
      <div className={`relative flex items-center h-10 rounded-2xl ${
        embedded
          ? "bg-foreground/6"
          : "bg-white shadow-panel"
      }`}>
        <Search
          size={15}
          className="absolute left-3.5 text-foreground/40 pointer-events-none"
        />
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
        <div className="fixed left-3 right-3 top-15 z-1100 md:absolute md:top-full md:left-0 md:right-auto md:mt-2 md:w-72 animate-scale-in pointer-events-auto bg-white rounded-xl shadow-dropdown max-h-[60vh] overflow-hidden">
          <div className="max-h-[inherit] overflow-y-auto overscroll-contain">
            {!hasAnyResults && query.trim() && (
              <div className="px-4 py-6 text-center text-sm text-foreground/50 font-medium">
                No results found
              </div>
            )}

            {!query.trim() && (
              <div className="px-4 py-3 text-[11px] font-semibold text-foreground/40 uppercase tracking-wider">
                All lines
              </div>
            )}

            {/* Line results */}
            {TYPE_ORDER.filter(
              (type) => type !== "train" && groupedLines[type]?.length,
            ).map((type) => (
              <div key={type}>
                <div className="px-4 py-1.5 text-[11px] font-semibold text-foreground/40 uppercase tracking-wider">
                  {TYPE_LABELS[type] ?? type}
                </div>
                <div className="px-2 pb-1 flex flex-wrap gap-1">
                  {groupedLines[type].map((line) => (
                    <button
                      key={`${line.type}_${line.lineNumber}`}
                      onClick={() => handleSelectLine(line)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-foreground/6 active:bg-foreground/10 transition-colors"
                    >
                      <TypeIcon type={line.type} className="shrink-0" />
                      <span className="text-sm font-medium text-foreground/80">
                        {line.lineNumber}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {showAllTrains && (
              <div>
                <div className="px-4 py-1.5 text-[11px] font-semibold text-foreground/40 uppercase tracking-wider">
                  Train
                </div>
                <div className="px-2 pb-1">
                  <button
                    onClick={handleSelectAllTrains}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-foreground/6 active:bg-foreground/10 transition-colors"
                  >
                    <TypeIcon type="train" className="shrink-0" />
                    <span className="text-sm font-medium text-foreground/80">
                      All Trains
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* Stop results */}
            {hasStopResults && (
              <div>
                <div className="px-4 py-1.5 text-[11px] font-semibold text-foreground/40 uppercase tracking-wider border-t border-foreground/6 mt-1 pt-2">
                  Stops
                </div>
                <div className="px-1 pb-2">
                  {filteredStops.map((stop) => (
                    <button
                      key={stop.stopId}
                      onClick={() => handleSelectStop(stop)}
                      className="w-full flex items-start gap-2.5 px-3 py-2 rounded-lg hover:bg-foreground/6 active:bg-foreground/10 transition-colors text-left"
                    >
                      <MapPin
                        size={14}
                        className="shrink-0 text-foreground/35 mt-0.5"
                      />
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-foreground/85 truncate">
                            {stop.stopName}
                          </span>
                          {stop.stopArea && stop.stopArea !== "Kesklinn" && (
                            <span className="text-xs text-foreground/45 shrink-0">
                              {stop.stopArea}
                            </span>
                          )}
                        </div>
                        {stop.stopDesc && (
                          <span className="text-xs text-foreground/50 truncate mt-0.5">
                            {stop.stopDesc}
                          </span>
                        )}
                        {stop.lines && stop.lines.length > 0 && (
                          <div className="flex flex-wrap gap-0.5 mt-1">
                            {stop.lines.slice(0, 8).map((line) => {
                              const typeCode = line[0];
                              const lineNum = line.slice(2);
                              const c = STOP_TYPE_COLORS[typeCode] || "#888";
                              return (
                                <span
                                  key={line}
                                  className="text-[9px] px-1 rounded text-white font-semibold"
                                  style={{ backgroundColor: c }}
                                >
                                  {lineNum}
                                </span>
                              );
                            })}
                            {stop.lines.length > 8 && (
                              <span className="text-[9px] text-foreground/45 font-medium">
                                +{stop.lines.length - 8}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
