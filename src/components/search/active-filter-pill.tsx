"use client";

import { MapPin, X } from "lucide-react";
import { TYPE_COLORS } from "@/lib/constants";
import type { StopDto } from "@/lib/types";
import { getFilterLabel } from "@/hooks/use-transit-search";

type FilterPillVariant = "desktop" | "mobile";

interface ActiveFilterPillProps {
  selectedLine: { lineNumber: string; type: string } | null;
  selectedStop: StopDto | null;
  vehicleCount: number;
  onClear: () => void;
  variant: FilterPillVariant;
}

const variantStyles: Record<
  FilterPillVariant,
  {
    container: string;
    dot: string;
    pin: string;
    label: string;
    sep: string;
    count: string;
    clearButton: string;
    clearIcon: number;
  }
> = {
  desktop: {
    container: "flex items-center gap-2 h-10 px-3 rounded-2xl cursor-default min-w-0 bg-foreground/6",
    dot: "w-2.5 h-2.5 rounded-full shrink-0",
    pin: "text-foreground/50 shrink-0",
    label: "text-sm font-semibold text-foreground/85 truncate",
    sep: "text-foreground/25 font-medium",
    count: "text-xs font-semibold text-foreground/55 tabular-nums whitespace-nowrap",
    clearButton:
      "ml-auto p-0.5 rounded-full hover:bg-foreground/8 text-foreground/40 hover:text-foreground/70 transition-colors shrink-0",
    clearIcon: 14,
  },
  mobile: {
    container: "flex items-center gap-2 h-12 px-4 rounded-2xl bg-foreground/[0.04]",
    dot: "w-3 h-3 rounded-full shrink-0",
    pin: "text-foreground/50 shrink-0",
    label: "text-[15px] font-bold text-foreground/85 truncate",
    sep: "text-foreground/25",
    count: "text-[14px] font-bold text-foreground/55 tabular-nums",
    clearButton: "ml-auto p-1 rounded-full hover:bg-foreground/10",
    clearIcon: 16,
  },
};

export function ActiveFilterPill({
  selectedLine,
  selectedStop,
  vehicleCount,
  onClear,
  variant,
}: ActiveFilterPillProps) {
  const styles = variantStyles[variant];

  return (
    <div className={styles.container}>
      {selectedLine ? (
        <span
          className={styles.dot}
          style={{ backgroundColor: TYPE_COLORS[selectedLine.type] || TYPE_COLORS.unknown }}
        />
      ) : (
        <MapPin size={variant === "mobile" ? 16 : 14} className={styles.pin} />
      )}

      <span className={styles.label}>{getFilterLabel(selectedLine, selectedStop)}</span>

      {selectedLine && (
        <>
          <span className={styles.sep}>·</span>
          <span className={styles.count}>{vehicleCount} live</span>
        </>
      )}

      <button onClick={onClear} className={styles.clearButton}>
        <X size={styles.clearIcon} className="text-foreground/40" />
      </button>
    </div>
  );
}
