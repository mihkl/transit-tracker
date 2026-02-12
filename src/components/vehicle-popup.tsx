"use client";

import type { VehicleDto } from "@/lib/types";
import { formatEta, formatSpeed, formatDistance } from "@/lib/format-utils";
import { Badge } from "@/components/ui/badge";

interface VehiclePopupProps {
  vehicle: VehicleDto;
}

export function VehiclePopup({ vehicle: v }: VehiclePopupProps) {
  return (
    <div className="min-w-[180px]">
      <div className="flex items-center gap-2 mb-2">
        <Badge
          className="text-white"
          style={{
            backgroundColor:
              v.transportType === "bus"
                ? "#2196F3"
                : v.transportType === "tram"
                  ? "#F44336"
                  : v.transportType === "trolleybus"
                    ? "#4CAF50"
                    : "#999",
          }}
        >
          {v.lineNumber}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {v.transportType} #{v.id}
        </span>
      </div>

      {v.destination && (
        <div className="text-sm mb-2">
          <span className="text-muted-foreground">To: </span>
          <span className="font-medium">{v.destination}</span>
        </div>
      )}

      {v.nextStop && (
        <>
          <div className="text-sm font-medium mb-1">
            Next: {v.nextStop.name}
          </div>
          <div className="text-lg font-bold text-primary mb-2">
            {formatEta(v.nextStop.etaSeconds)}
          </div>
        </>
      )}

      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Speed</span>
          <span>{formatSpeed(v.speedMs > 0 ? Math.round(v.speedMs * 3.6) : null)}</span>
        </div>
        {v.nextStop && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Distance</span>
            <span>{formatDistance(v.nextStop.distanceMeters)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Direction</span>
          <span>{v.directionId}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Stop</span>
          <span>
            {v.stopIndex + 1} / {v.totalStops}
          </span>
        </div>
      </div>
    </div>
  );
}
