"use client";

import { MapPin } from "lucide-react";
import { TypeIcon } from "@/components/line-search-input";
import { TYPE_LABELS } from "@/lib/constants";
import { STOP_TYPE_COLORS, TYPE_ORDER } from "@/lib/search-utils";
import type { LineDto, StopDto } from "@/lib/types";

type SearchResultsVariant = "desktop" | "mobile";

interface SearchResultsListProps {
  query: string;
  groupedLines: Record<string, LineDto[]>;
  filteredStops: StopDto[];
  showAllTrains: boolean;
  hasAnyResults: boolean;
  onSelectLine: (line: LineDto) => void;
  onSelectAllTrains: () => void;
  onSelectStop: (stop: StopDto) => void;
  variant: SearchResultsVariant;
}

const stylesByVariant: Record<
  SearchResultsVariant,
  {
    noResults: string;
    allLinesHeading: string;
    sectionHeading: string;
    lineWrap: string;
    lineButton: string;
    lineText: string;
    trainWrap: string;
    stopHeading: string;
    stopList: string;
    stopButton: string;
    stopIconSize: number;
    stopName: string;
    stopArea: string;
    stopDesc: string;
    stopBadgesWrap: string;
    stopBadge: string;
    stopBadgeOverflow: string;
  }
> = {
  desktop: {
    noResults: "px-4 py-6 text-center text-sm text-foreground/50 font-medium",
    allLinesHeading: "px-4 py-3 text-[11px] font-semibold text-foreground/40 uppercase tracking-wider",
    sectionHeading:
      "px-4 py-1.5 text-[11px] font-semibold text-foreground/40 uppercase tracking-wider",
    lineWrap: "px-2 pb-1 flex flex-wrap gap-1",
    lineButton:
      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-foreground/6 active:bg-foreground/10 transition-colors",
    lineText: "text-sm font-medium text-foreground/80",
    trainWrap: "px-2 pb-1",
    stopHeading:
      "px-4 py-1.5 text-[11px] font-semibold text-foreground/40 uppercase tracking-wider border-t border-foreground/6 mt-1 pt-2",
    stopList: "px-1 pb-2",
    stopButton:
      "w-full flex items-start gap-2.5 px-3 py-2 rounded-lg hover:bg-foreground/6 active:bg-foreground/10 transition-colors text-left",
    stopIconSize: 14,
    stopName: "text-sm font-medium text-foreground/85 truncate",
    stopArea: "text-xs text-foreground/45 shrink-0",
    stopDesc: "text-xs text-foreground/50 truncate mt-0.5",
    stopBadgesWrap: "flex flex-wrap gap-0.5 mt-1",
    stopBadge: "text-[9px] px-1 rounded text-white font-semibold",
    stopBadgeOverflow: "text-[9px] text-foreground/45 font-medium",
  },
  mobile: {
    noResults: "px-4 py-12 text-center text-[15px] text-foreground/50 font-medium",
    allLinesHeading: "px-4 py-3 text-[12px] font-bold text-foreground/40 uppercase tracking-wider",
    sectionHeading:
      "px-4 py-2 text-[12px] font-bold text-foreground/40 uppercase tracking-wider",
    lineWrap: "px-3 pb-2 flex flex-wrap gap-1.5",
    lineButton:
      "flex items-center gap-2 h-12 px-3.5 rounded-xl hover:bg-foreground/6 active:bg-foreground/10 transition-colors",
    lineText: "text-[15px] font-semibold text-foreground/80",
    trainWrap: "px-3 pb-2",
    stopHeading:
      "px-4 py-2 text-[12px] font-bold text-foreground/40 uppercase tracking-wider border-t border-foreground/6 mt-2 pt-3",
    stopList: "px-2 pb-2",
    stopButton:
      "w-full flex items-start gap-3 px-3 py-3 min-h-[56px] rounded-xl hover:bg-foreground/6 active:bg-foreground/10 transition-colors text-left",
    stopIconSize: 18,
    stopName: "text-[15px] font-semibold text-foreground/85 truncate",
    stopArea: "text-[13px] text-foreground/45 shrink-0",
    stopDesc: "text-[13px] text-foreground/50 truncate mt-0.5",
    stopBadgesWrap: "flex flex-wrap gap-1 mt-1.5",
    stopBadge: "text-[10px] px-1.5 py-0.5 rounded text-white font-bold",
    stopBadgeOverflow: "text-[10px] text-foreground/45 font-medium",
  },
};

export function SearchResultsList({
  query,
  groupedLines,
  filteredStops,
  showAllTrains,
  hasAnyResults,
  onSelectLine,
  onSelectAllTrains,
  onSelectStop,
  variant,
}: SearchResultsListProps) {
  const styles = stylesByVariant[variant];
  const queryTrimmed = query.trim();
  const hasStopResults = filteredStops.length > 0;

  return (
    <>
      {!hasAnyResults && queryTrimmed && <div className={styles.noResults}>No results found</div>}

      {!queryTrimmed && <div className={styles.allLinesHeading}>All lines</div>}

      {TYPE_ORDER.filter((type) => type !== "train" && groupedLines[type]?.length).map((type) => (
        <div key={type}>
          <div className={styles.sectionHeading}>{TYPE_LABELS[type] ?? type}</div>
          <div className={styles.lineWrap}>
            {groupedLines[type].map((line) => (
              <button
                key={`${line.type}_${line.lineNumber}`}
                onClick={() => onSelectLine(line)}
                className={styles.lineButton}
              >
                <TypeIcon type={line.type} className="shrink-0" />
                <span className={styles.lineText}>{line.lineNumber}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {showAllTrains && (
        <div>
          <div className={styles.sectionHeading}>Train</div>
          <div className={styles.trainWrap}>
            <button onClick={onSelectAllTrains} className={styles.lineButton}>
              <TypeIcon type="train" className="shrink-0" />
              <span className={styles.lineText}>All Trains</span>
            </button>
          </div>
        </div>
      )}

      {hasStopResults && (
        <div>
          <div className={styles.stopHeading}>Stops</div>
          <div className={styles.stopList}>
            {filteredStops.map((stop) => (
              <button
                key={stop.stopId}
                onClick={() => onSelectStop(stop)}
                className={styles.stopButton}
              >
                <MapPin
                  size={styles.stopIconSize}
                  className="shrink-0 text-foreground/35 mt-0.5"
                />
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={styles.stopName}>{stop.stopName}</span>
                    {stop.stopArea && stop.stopArea !== "Kesklinn" && (
                      <span className={styles.stopArea}>{stop.stopArea}</span>
                    )}
                  </div>
                  {stop.stopDesc && <span className={styles.stopDesc}>{stop.stopDesc}</span>}

                  {stop.lines && stop.lines.length > 0 && (
                    <div className={styles.stopBadgesWrap}>
                      {stop.lines.slice(0, 8).map((line) => {
                        const typeCode = line[0];
                        const lineNum = line.slice(2);
                        const color = STOP_TYPE_COLORS[typeCode] || "#888";
                        return (
                          <span key={line} className={styles.stopBadge} style={{ backgroundColor: color }}>
                            {lineNum}
                          </span>
                        );
                      })}
                      {stop.lines.length > 8 && (
                        <span className={styles.stopBadgeOverflow}>+{stop.lines.length - 8}</span>
                      )}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
