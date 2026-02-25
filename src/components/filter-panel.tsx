"use client";

import { UnifiedSearch } from "@/components/unified-search";
import { Button } from "@/components/ui/button";
import { Car, Bus } from "lucide-react";
import { Icon } from "@/components/icon";
import { useTransitStore } from "@/store/use-transit-store";
import type { LineDto } from "@/lib/types";

interface FilterPanelProps {
  vehicleCount: number;
  lines: LineDto[];
}

export function FilterPanel({ vehicleCount, lines }: FilterPanelProps) {
  const showPlanner = useTransitStore((s) => s.showPlanner);
  const setShowPlanner = useTransitStore((s) => s.setShowPlanner);
  const showTraffic = useTransitStore((s) => s.showTraffic);
  const toggleTraffic = useTransitStore((s) => s.toggleTraffic);
  const showVehicles = useTransitStore((s) => s.showVehicles);
  const toggleVehicles = useTransitStore((s) => s.toggleVehicles);
  const showStops = useTransitStore((s) => s.showStops);
  const toggleStops = useTransitStore((s) => s.toggleStops);

  return (
    <>
      {/* Desktop only — search bar + controls in one row */}
      <div className="hidden md:flex absolute top-3 right-3 z-[1000] items-center gap-2 px-2 py-1.5 bg-white rounded-2xl shadow-panel">
        <div className="w-64">
          <UnifiedSearch lines={lines} vehicleCount={vehicleCount} embedded />
        </div>

        <div className="w-px h-5 bg-foreground/6" />

        <Button
          variant={showVehicles ? "default" : "ghost"}
          size="sm"
          className="h-10 px-3 rounded-xl text-sm font-semibold"
          onClick={toggleVehicles}
          title="Toggle live vehicles"
        >
          <Bus className="w-4 h-4 mr-1.5" />
          Vehicles
        </Button>

        <Button
          variant={showTraffic ? "default" : "ghost"}
          size="sm"
          className="h-10 px-3 rounded-xl text-sm font-semibold"
          onClick={toggleTraffic}
          title="Toggle traffic overlay"
        >
          <Car className="w-4 h-4 mr-1.5" />
          Traffic
        </Button>

        <Button
          variant={showStops ? "default" : "ghost"}
          size="sm"
          className="h-10 px-3 rounded-xl text-sm font-semibold"
          onClick={toggleStops}
          title="Toggle all stops"
        >
          <Icon name="map-pin" className="w-4 h-4 mr-1.5" />
          Stops
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-10 px-3 rounded-xl text-sm font-semibold"
          onClick={() => setShowPlanner(!showPlanner)}
        >
          <Icon name="arrow-right" className="w-4 h-4 mr-1.5" />
          Directions
        </Button>

        <div className="w-px h-5 bg-foreground/6" />

        <div className="flex items-center gap-1.5 px-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-live shrink-0" />
          <span className="text-[11px] text-foreground/45 font-medium">live</span>
        </div>
      </div>
    </>
  );
}
