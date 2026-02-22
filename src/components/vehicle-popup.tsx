import type { VehicleDto } from "@/lib/types";
import { getTransportColor } from "@/lib/constants";
import { formatEta, formatDistance } from "@/lib/format-utils";
import { Badge } from "@/components/ui/badge";

export function VehiclePopup({ vehicle }: { vehicle: VehicleDto }) {
  const color = getTransportColor(vehicle.transportType);
  const progress =
    vehicle.totalStops > 0 ? ((vehicle.stopIndex + 1) / vehicle.totalStops) * 100 : 0;

  return (
    <div className="min-w-48 p-1">
      <div className="flex items-center gap-2.5 mb-3">
        <Badge
          className="text-white text-sm px-2.5 py-0.5 font-bold rounded-lg"
          style={{ backgroundColor: color }}
        >
          {vehicle.lineNumber}
        </Badge>
        <span className="text-xs text-foreground/55 font-medium">
          {vehicle.transportType} #{vehicle.id}
        </span>
      </div>

      {vehicle.destination && (
        <div className="text-sm mb-3">
          <span className="text-foreground/55">To </span>
          <span className="font-semibold text-foreground/90">{vehicle.destination}</span>
        </div>
      )}

      {vehicle.nextStop && (
        <div className="rounded-xl bg-foreground/[0.04] px-3 py-2.5 mb-3">
          <div className="text-xs text-foreground/55 font-medium mb-0.5">Next stop</div>
          <div className="text-sm font-semibold text-foreground/90 mb-1">
            {vehicle.nextStop.name}
          </div>
          <div className="text-2xl font-bold tracking-tight" style={{ color }}>
            {formatEta(vehicle.nextStop.etaSeconds)}
          </div>
        </div>
      )}

      <div className="space-y-2 text-xs">
        {vehicle.nextStop && (
          <div className="flex justify-between items-center">
            <span className="text-foreground/55 font-medium">Distance</span>
            <span className="font-semibold text-foreground/75">
              {formatDistance(vehicle.nextStop.distanceMeters)}
            </span>
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-foreground/55 font-medium">Progress</span>
          <span className="font-semibold text-foreground/75">
            {vehicle.stopIndex + 1} / {vehicle.totalStops}
          </span>
        </div>
        {vehicle.totalStops > 0 && (
          <div className="h-1.5 rounded-full bg-foreground/[0.08] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%`, backgroundColor: color }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
