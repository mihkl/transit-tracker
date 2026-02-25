"use client";

import { useCallback, useEffect, useRef } from "react";
import { Bus, Car, MapPin } from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import { QuickActionsPanel } from "@/components/quick-actions-panel";
import { MobileSearchView } from "@/components/mobile-search-view";
import { useTransitStore } from "@/store/use-transit-store";
import type { LineDto } from "@/lib/types";

interface HomeMobileOverlaysProps {
  isDesktop: boolean;
  lines: LineDto[];
  vehicleCount: number;
  onToggleVehicles: () => void;
}

export function HomeMobileOverlays({
  isDesktop,
  lines,
  vehicleCount,
  onToggleVehicles,
}: HomeMobileOverlaysProps) {
  const mobileTab = useTransitStore((s) => s.mobileTab);
  const goToMapTab = useTransitStore((s) => s.goToMapTab);
  const showMobileLayers = useTransitStore((s) => s.showMobileLayers);
  const setShowMobileLayers = useTransitStore((s) => s.setShowMobileLayers);
  const showVehicles = useTransitStore((s) => s.showVehicles);
  const showTraffic = useTransitStore((s) => s.showTraffic);
  const toggleTraffic = useTransitStore((s) => s.toggleTraffic);
  const showStops = useTransitStore((s) => s.showStops);
  const toggleStops = useTransitStore((s) => s.toggleStops);
  const mobileLayersMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (showMobileLayers) return;
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      mobileLayersMenuRef.current?.contains(active)
    ) {
      active.blur();
    }
  }, [showMobileLayers]);

  const handleLayerClick = useCallback(
    (action: () => void) => {
      action();
      setShowMobileLayers(false);
    },
    [setShowMobileLayers],
  );

  if (isDesktop) return null;

  return (
    <>
      <BottomSheet open={mobileTab === "nearby"} onClose={goToMapTab}>
        <QuickActionsPanel />
      </BottomSheet>

      {mobileTab === "search" && (
        <div className="absolute inset-0 z-[1100] bg-white">
          <MobileSearchView lines={lines} vehicleCount={vehicleCount} />
        </div>
      )}

      <div className="absolute bottom-20 right-2 z-[1150] pointer-events-none">
        <div
          ref={mobileLayersMenuRef}
          className={`flex flex-col items-end gap-2 transition-all duration-200 ${
            showMobileLayers
              ? "opacity-100 translate-y-0 scale-100"
              : "opacity-0 translate-y-2 scale-95"
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
      </div>
    </>
  );
}
