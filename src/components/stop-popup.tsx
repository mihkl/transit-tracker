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
    <div className="min-w-52 p-1">
      <div className="mb-3">
        <div className="font-bold text-sm text-foreground/90">
          {stop.stopName}
        </div>
        {stop.stopDesc && (
          <div className="text-xs text-foreground/55 font-medium mt-0.5">
            {stop.stopDesc}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-3 text-xs text-foreground/55">
          <div className="w-3 h-3 border-2 border-foreground/20 border-t-foreground/55 rounded-full animate-spin" />
          <span className="font-medium">Loading arrivals...</span>
        </div>
      ) : departures.length === 0 ? (
        <div className="text-xs text-foreground/50 py-2 font-medium">
          No real-time arrivals available.
        </div>
      ) : (
        <div className="space-y-1">
          {departures.map((dep, i) => (
            <div
              key={i}
              className="flex items-center gap-2.5 text-xs py-1.5 rounded-lg"
            >
              <Badge
                className="text-white text-[10px] px-1.5 py-0 h-[18px] font-bold rounded-md"
                style={{
                  backgroundColor: getTransportColor(dep.transportType),
                }}
              >
                {dep.route}
              </Badge>
              <span className="flex-1 truncate text-foreground/65 font-medium">
                {dep.destination}
              </span>
              <span className="font-bold text-foreground/85 tabular-nums">
                {formatEta(dep.secondsUntilArrival)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
