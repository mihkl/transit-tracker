"use client";

import { useCallback, useEffect } from "react";
import { Bus, Car, Layers, MapPin } from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import { QuickActionsPanel } from "@/components/quick-actions-panel";
import { MobileSearchView } from "@/components/mobile-search-view";
import { useTransitStore } from "@/store/use-transit-store";
import { dismissOverlay } from "@/lib/navigation";
import type { LineDto } from "@/lib/types";

interface HomeMobileOverlaysProps {
  lines: LineDto[];
  vehicleCount: number;
  onToggleVehicles: () => void;
}

export function HomeMobileOverlays({
  lines,
  vehicleCount,
  onToggleVehicles,
}: HomeMobileOverlaysProps) {
  const activeOverlay = useTransitStore((s) => s.activeOverlay);
  const showMobileLayers = useTransitStore((s) => s.showMobileLayers);
  const setShowMobileLayers = useTransitStore((s) => s.setShowMobileLayers);
  const showVehicles = useTransitStore((s) => s.showVehicles);
  const showTraffic = useTransitStore((s) => s.showTraffic);
  const toggleTraffic = useTransitStore((s) => s.toggleTraffic);
  const showStops = useTransitStore((s) => s.showStops);
  const toggleStops = useTransitStore((s) => s.toggleStops);

  useEffect(() => {
    if (activeOverlay) setShowMobileLayers(false);
  }, [activeOverlay, setShowMobileLayers]);

  const handleLayerClick = useCallback(
    (action: () => void) => {
      action();
      setShowMobileLayers(false);
    },
    [setShowMobileLayers],
  );

  const closeToMap = useCallback(() => dismissOverlay(null), []);

  return (
    <>
      <BottomSheet open={activeOverlay === "nearby"} onClose={closeToMap}>
        <QuickActionsPanel />
      </BottomSheet>

      {activeOverlay === "search" && (
        <div className="absolute inset-0 z-[1100] bg-white md:hidden">
          <MobileSearchView lines={lines} vehicleCount={vehicleCount} />
        </div>
      )}

      {!activeOverlay && <div
        className="fixed right-2 z-1250 pointer-events-none md:hidden"
        style={{
          bottom:
            "max(calc(5rem + env(safe-area-inset-bottom, 0px)), calc(var(--mobile-bottom-sheet-offset, 0px) + 0.75rem + env(safe-area-inset-bottom, 0px)))",
        }}
      >
        <div className="flex flex-col items-end gap-2">
          <div
            className={`flex flex-col items-end gap-2 transition-all duration-200 ${
              showMobileLayers
                ? "opacity-100 translate-y-0 scale-100"
                : "opacity-0 translate-y-2 scale-95 pointer-events-none"
            }`}
          >
          <button
            onClick={() => handleLayerClick(onToggleVehicles)}
            className={`pointer-events-auto h-10 min-w-[102px] px-2 rounded-xl border flex items-center justify-center gap-1.5 text-sm font-semibold shadow-lg transition-colors ${
              showVehicles
                ? "border-primary bg-primary text-white shadow-primary/25"
                : "border-foreground/10 bg-white/95 text-foreground/75 backdrop-blur-md"
            }`}
            tabIndex={showMobileLayers ? 0 : -1}
          >
            <span>Vehicles</span>
            <Bus className="h-4 w-4" />
          </button>

          <button
            onClick={() => handleLayerClick(toggleTraffic)}
            className={`pointer-events-auto h-10 min-w-[102px] px-2 rounded-xl border flex items-center justify-center gap-1.5 text-sm font-semibold shadow-lg transition-colors ${
              showTraffic
                ? "border-primary bg-primary text-white shadow-primary/25"
                : "border-foreground/10 bg-white/95 text-foreground/75 backdrop-blur-md"
            }`}
            tabIndex={showMobileLayers ? 0 : -1}
          >
            <span>Traffic</span>
            <Car className="h-4 w-4" />
          </button>

          <button
            onClick={() => handleLayerClick(toggleStops)}
            className={`pointer-events-auto h-10 min-w-[102px] px-2 rounded-xl border flex items-center justify-center gap-1.5 text-sm font-semibold shadow-lg transition-colors ${
              showStops
                ? "border-primary bg-primary text-white shadow-primary/25"
                : "border-foreground/10 bg-white/95 text-foreground/75 backdrop-blur-md"
            }`}
            tabIndex={showMobileLayers ? 0 : -1}
          >
            <span>Stops</span>
            <MapPin className="h-4 w-4" />
          </button>
          </div>

          {/* Layers FAB */}
          <button
            onClick={() => setShowMobileLayers(!showMobileLayers)}
            className={`pointer-events-auto h-12 w-12 rounded-full border flex items-center justify-center shadow-lg transition-colors ${
              showMobileLayers
                ? "border-primary bg-primary text-white shadow-primary/25"
                : "border-foreground/10 bg-white/95 text-foreground/60 backdrop-blur-md"
            }`}
            aria-label="Toggle layers"
          >
            <Layers size={22} strokeWidth={showMobileLayers ? 2.5 : 1.8} />
          </button>
        </div>
      </div>}
    </>
  );
}
