import type { StopDto, StopDeparture } from "@/lib/types";
import { getTransportColor } from "@/lib/constants";
import { formatEta } from "@/lib/format-utils";
import { Badge } from "@/components/ui/badge";

interface StopPopupProps {
  stop: StopDto;
  departures: StopDeparture[];
  loading: boolean;
}

export function StopPopup({ stop, departures, loading }: StopPopupProps) {
  return (
    <div className="min-w-50 p-1">
      <div className="font-semibold text-sm">{stop.stopName}</div>
      {stop.stopDesc && (
        <div className="text-xs text-muted-foreground mb-2">
          {stop.stopDesc}
        </div>
      )}
      {!stop.stopDesc && <div className="mb-2" />}

      {loading ? (
        <div className="text-xs text-muted-foreground">Loading arrivals...</div>
      ) : departures.length === 0 ? (
        <div className="text-xs text-muted-foreground">
          No real-time arrivals available for this stop.
        </div>
      ) : (
        <div className="space-y-1.5">
          {departures.map((dep, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <Badge
                className="text-white text-[10px] px-1.5 py-0 h-4"
                style={{
                  backgroundColor: getTransportColor(dep.transportType),
                }}
              >
                {dep.route}
              </Badge>
              <span className="flex-1 truncate text-muted-foreground">
                {dep.destination}
              </span>
              <span className="font-medium">
                {formatEta(dep.secondsUntilArrival)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
