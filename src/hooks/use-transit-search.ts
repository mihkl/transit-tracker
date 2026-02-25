"use client";

import { useMemo } from "react";
import type { LineDto, StopDto } from "@/lib/types";
import { TYPE_LABELS } from "@/lib/constants";
import { TYPE_ORDER, groupAndSortLines, uniqueLines as buildUniqueLines } from "@/lib/search-utils";
import type { LineType } from "@/lib/domain";

interface UseTransitSearchParams {
  lines: LineDto[];
  stops: StopDto[];
  query: string;
  stopLimit?: number;
}

export function useTransitSearch({
  lines,
  stops,
  query,
  stopLimit = 8,
}: UseTransitSearchParams) {
  const normalizedQuery = query.trim().toLowerCase();

  const uniqueLines = useMemo(() => buildUniqueLines(lines), [lines]);

  const filteredLines = useMemo(() => {
    if (!normalizedQuery) return uniqueLines;
    return uniqueLines.filter(
      (line) =>
        line.lineNumber.toLowerCase().includes(normalizedQuery) ||
        (TYPE_LABELS[line.type] ?? line.type).toLowerCase().includes(normalizedQuery),
    );
  }, [normalizedQuery, uniqueLines]);

  const groupedLines = useMemo(() => groupAndSortLines(filteredLines), [filteredLines]);

  const filteredStops = useMemo(() => {
    if (!normalizedQuery) return [];
    return stops
      .filter((stop) => stop.stopName.toLowerCase().includes(normalizedQuery))
      .slice(0, stopLimit);
  }, [normalizedQuery, stopLimit, stops]);

  const showAllTrains = useMemo(
    () => !normalizedQuery || "all trains".includes(normalizedQuery) || "train".includes(normalizedQuery),
    [normalizedQuery],
  );

  const hasLineResults = TYPE_ORDER.some(
    (type) => type !== "train" && groupedLines[type]?.length,
  );
  const hasStopResults = filteredStops.length > 0;
  const hasAnyResults = hasLineResults || hasStopResults || showAllTrains;

  return {
    normalizedQuery,
    groupedLines,
    filteredStops,
    showAllTrains,
    hasLineResults,
    hasStopResults,
    hasAnyResults,
  };
}

export function getFilterLabel(
  selectedLine: { lineNumber: string; type: LineType } | null,
  selectedStop: StopDto | null,
): string {
  if (!selectedLine) return selectedStop?.stopName ?? "";
  if (!selectedLine.lineNumber) return "All Trains";
  return `${TYPE_LABELS[selectedLine.type] ?? selectedLine.type} ${selectedLine.lineNumber}`;
}
