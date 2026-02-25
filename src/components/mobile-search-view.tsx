"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Search, MapPin, X } from "lucide-react";
import { TypeIcon } from "@/components/line-search-input";
import { TYPE_LABELS, TYPE_COLORS } from "@/lib/constants";
import type { LineDto, StopDto } from "@/lib/types";
import {
  STOP_TYPE_COLORS,
  TYPE_ORDER,
  groupAndSortLines,
  uniqueLines as buildUniqueLines,
} from "@/lib/search-utils";
import { useStops } from "@/hooks/use-stops";

interface MobileSearchViewProps {
  lines: LineDto[];
  selectedLine: { lineNumber: string; type: string } | null;
  onLineSelect: (line: { lineNumber: string; type: string } | null) => void;
  selectedStop: StopDto | null;
  onStopSelect: (stop: StopDto | null) => void;
  vehicleCount: number;
  onClose: () => void;
}

export function MobileSearchView({
  lines,
  selectedLine,
  onLineSelect,
  selectedStop,
  onStopSelect,
  vehicleCount,
  onClose,
}: MobileSearchViewProps) {
  const [query, setQuery] = useState("");
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef<number | null>(null);
  const startXRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { stops } = useStops();

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  const uniqueLines = useMemo(() => buildUniqueLines(lines), [lines]);

  const filteredLines = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return uniqueLines;
    return uniqueLines.filter(
      (l) =>
        l.lineNumber.toLowerCase().includes(q) ||
        (TYPE_LABELS[l.type] ?? l.type).toLowerCase().includes(q),
    );
  }, [uniqueLines, query]);

  const groupedLines = useMemo(() => groupAndSortLines(filteredLines), [filteredLines]);

  const filteredStops = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return stops.filter((s) => s.stopName.toLowerCase().includes(q)).slice(0, 8);
  }, [stops, query]);

  const showAllTrains = useMemo(() => {
    const q = query.trim().toLowerCase();
    return !q || "all trains".includes(q) || "train".includes(q);
  }, [query]);

  const hasActiveFilter = !!(selectedLine || selectedStop);
  const hasLineResults = TYPE_ORDER.some(
    (type) => type !== "train" && groupedLines[type]?.length,
  );
  const hasStopResults = filteredStops.length > 0;
  const hasAnyResults = hasLineResults || hasStopResults || showAllTrains;

  const handleSelectLine = (line: LineDto) => {
    onStopSelect(null);
    onLineSelect({ lineNumber: line.lineNumber, type: line.type });
    onClose();
  };

  const handleSelectAllTrains = () => {
    onStopSelect(null);
    onLineSelect({ lineNumber: "", type: "train" });
    onClose();
  };

  const handleSelectStop = (stop: StopDto) => {
    onLineSelect(null);
    onStopSelect(stop);
    onClose();
  };

  const handleClearFilter = () => {
    onLineSelect(null);
    onStopSelect(null);
    setQuery("");
    inputRef.current?.focus();
  };

  const beginDrag = (clientX: number, clientY: number) => {
    startXRef.current = clientX;
    startYRef.current = clientY;
    startTimeRef.current = performance.now();
    setIsDragging(true);
  };

  const updateDrag = (clientX: number, clientY: number) => {
    if (startYRef.current === null || startXRef.current === null) return;
    const dx = clientX - startXRef.current;
    const dy = clientY - startYRef.current;
    const startedNearTop = startYRef.current <= 140;
    if (!startedNearTop || Math.abs(dy) <= Math.abs(dx) * 1.2) return;
    setDragY(Math.max(0, dy));
  };

  const endDrag = () => {
    if (startYRef.current === null) return;
    const elapsed = Math.max(1, performance.now() - startTimeRef.current);
    const velocity = dragY / elapsed;
    const shouldClose = dragY > 130 || velocity > 0.8;
    setIsDragging(false);
    startYRef.current = null;
    startXRef.current = null;
    if (shouldClose) {
      setDragY(0);
      onClose();
      return;
    }
    setDragY(0);
  };

  return (
    <div
      className={`h-full flex flex-col bg-white ${isDragging ? "" : "transition-transform duration-250 ease-out"}`}
      style={{ transform: `translateY(${dragY}px)` }}
      onTouchStart={(e) => beginDrag(e.touches[0].clientX, e.touches[0].clientY)}
      onTouchMove={(e) => updateDrag(e.touches[0].clientX, e.touches[0].clientY)}
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
          <div className="flex items-center gap-2 h-12 px-4 rounded-2xl bg-foreground/[0.04]">
            {selectedLine ? (
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{
                  backgroundColor:
                    TYPE_COLORS[selectedLine.type] || TYPE_COLORS.unknown,
                }}
              />
            ) : (
              <MapPin size={16} className="text-foreground/50 shrink-0" />
            )}
            <span className="text-[15px] font-bold text-foreground/85 truncate">
              {selectedLine
                ? selectedLine.lineNumber
                  ? `${TYPE_LABELS[selectedLine.type] ?? selectedLine.type} ${selectedLine.lineNumber}`
                  : "All Trains"
                : (selectedStop?.stopName ?? "")}
            </span>
            {selectedLine && (
              <>
                <span className="text-foreground/25">·</span>
                <span className="text-[14px] font-bold text-foreground/55 tabular-nums">
                  {vehicleCount} live
                </span>
              </>
            )}
            <button
              onClick={handleClearFilter}
              className="ml-auto p-1 rounded-full hover:bg-foreground/10"
            >
              <X size={16} className="text-foreground/40" />
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="flex-1 min-h-0 overflow-y-auto pb-20">
        {!hasAnyResults && query.trim() && (
          <div className="px-4 py-12 text-center text-[15px] text-foreground/50 font-medium">
            No results found
          </div>
        )}

        {!query.trim() && (
          <div className="px-4 py-3 text-[12px] font-bold text-foreground/40 uppercase tracking-wider">
            All lines
          </div>
        )}

        {/* Line results */}
        {TYPE_ORDER.filter(
          (type) => type !== "train" && groupedLines[type]?.length,
        ).map((type) => (
          <div key={type}>
            <div className="px-4 py-2 text-[12px] font-bold text-foreground/40 uppercase tracking-wider">
              {TYPE_LABELS[type] ?? type}
            </div>
            <div className="px-3 pb-2 flex flex-wrap gap-1.5">
              {groupedLines[type].map((line) => (
                <button
                  key={`${line.type}_${line.lineNumber}`}
                  onClick={() => handleSelectLine(line)}
                  className="flex items-center gap-2 h-12 px-3.5 rounded-xl hover:bg-foreground/6 active:bg-foreground/10 transition-colors"
                >
                  <TypeIcon type={line.type} className="shrink-0" />
                  <span className="text-[15px] font-semibold text-foreground/80">
                    {line.lineNumber}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* All trains */}
        {showAllTrains && (
          <div>
            <div className="px-4 py-2 text-[12px] font-bold text-foreground/40 uppercase tracking-wider">
              Train
            </div>
            <div className="px-3 pb-2">
              <button
                onClick={handleSelectAllTrains}
                className="flex items-center gap-2 h-12 px-3.5 rounded-xl hover:bg-foreground/6 active:bg-foreground/10 transition-colors"
              >
                <TypeIcon type="train" className="shrink-0" />
                <span className="text-[15px] font-semibold text-foreground/80">
                  All Trains
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Stop results */}
        {hasStopResults && (
          <div>
            <div className="px-4 py-2 text-[12px] font-bold text-foreground/40 uppercase tracking-wider border-t border-foreground/6 mt-2 pt-3">
              Stops
            </div>
            <div className="px-2 pb-2">
              {filteredStops.map((stop) => (
                <button
                  key={stop.stopId}
                  onClick={() => handleSelectStop(stop)}
                  className="w-full flex items-start gap-3 px-3 py-3 min-h-[56px] rounded-xl hover:bg-foreground/6 active:bg-foreground/10 transition-colors text-left"
                >
                  <MapPin size={18} className="shrink-0 text-foreground/35 mt-0.5" />
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold text-foreground/85 truncate">
                        {stop.stopName}
                      </span>
                      {stop.stopArea && stop.stopArea !== "Kesklinn" && (
                        <span className="text-[13px] text-foreground/45 shrink-0">
                          {stop.stopArea}
                        </span>
                      )}
                    </div>
                    {stop.stopDesc && (
                      <span className="text-[13px] text-foreground/50 truncate mt-0.5">
                        {stop.stopDesc}
                      </span>
                    )}
                    {stop.lines && stop.lines.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {stop.lines.slice(0, 8).map((line) => {
                          const typeCode = line[0];
                          const lineNum = line.slice(2);
                          const c = STOP_TYPE_COLORS[typeCode] || "#888";
                          return (
                            <span
                              key={line}
                              className="text-[10px] px-1.5 py-0.5 rounded text-white font-bold"
                              style={{ backgroundColor: c }}
                            >
                              {lineNum}
                            </span>
                          );
                        })}
                        {stop.lines.length > 8 && (
                          <span className="text-[10px] text-foreground/45 font-medium">
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
  );
}
