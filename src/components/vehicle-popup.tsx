import type { VehicleDto } from "@/lib/types";
import { getTransportColor } from "@/lib/constants";
import { formatEta, formatDistance } from "@/lib/format-utils";
import { Badge } from "@/components/ui/badge";

export function VehiclePopup({ vehicle }: { vehicle: VehicleDto }) {
  return (
    <div className="min-w-45 p-1">
      <div className="flex items-center gap-2 mb-2">
        <Badge
          className="text-white"
          style={{ backgroundColor: getTransportColor(vehicle.transportType) }}
        >
          {vehicle.lineNumber}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {vehicle.transportType} #{vehicle.id}
        </span>
      </div>

      {vehicle.destination && (
        <div className="text-sm mb-2">
          <span className="text-muted-foreground">To: </span>
          <span className="font-medium">{vehicle.destination}</span>
        </div>
      )}

      {vehicle.nextStop && (
        <>
          <div className="text-sm font-medium mb-1">
            Next: {vehicle.nextStop.name}
          </div>
          <div className="text-lg font-bold text-primary mb-2">
            {formatEta(vehicle.nextStop.etaSeconds)}
          </div>
        </>
      )}

      <div className="space-y-1 text-xs">
        {vehicle.nextStop && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Distance</span>
            <span>{formatDistance(vehicle.nextStop.distanceMeters)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Stop</span>
          <span>
            {vehicle.stopIndex + 1} / {vehicle.totalStops}
          </span>
        </div>
      </div>
    </div>
  );
}
