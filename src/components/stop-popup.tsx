import type { StopDto, StopArrival } from "@/lib/types";
import { getTransportColor } from "@/lib/constants";
import { formatEta } from "@/lib/format-utils";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";

interface StopPopupProps {
  stop: StopDto;
  arrivals: StopArrival[];
  loading: boolean;
}

export function StopPopup({ stop, arrivals, loading }: StopPopupProps) {
  const formatDelayBadge = (seconds: number) => {
    const abs = Math.abs(seconds);
    if (abs < 30) return "On time";
    if (abs < 60) return seconds > 0 ? `+${abs}s` : `-${abs}s`;
    const min = Math.round(abs / 60);
    return seconds > 0 ? `+${min}m` : `-${min}m`;
  };

  const delayTone = (seconds: number) => {
    if (Math.abs(seconds) < 30) return "text-emerald-700 bg-emerald-50";
    if (seconds > 0) return "text-red-700 bg-red-50";
    return "text-blue-700 bg-blue-50";
  };

  return (
    <div className="min-w-52 p-1">
      <div className="mb-3">
        <div className="font-bold text-sm text-foreground/90">{stop.stopName}</div>
        {stop.stopDesc && (
          <div className="text-xs text-foreground/55 font-medium mt-0.5">{stop.stopDesc}</div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-3 text-xs text-foreground/55">
          <div className="w-3 h-3 border-2 border-foreground/20 border-t-foreground/55 rounded-full animate-spin" />
          <span className="font-medium">Loading arrivals...</span>
        </div>
      ) : arrivals.length === 0 ? (
        <div className="text-xs text-foreground/50 py-2 font-medium">
          No real-time arrivals available.
        </div>
      ) : (
        <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
          {arrivals.map((dep, i) => (
            <div
              key={i}
              className="rounded-lg border border-foreground/8 bg-white px-2.5 py-2 text-xs"
            >
              <div className="flex items-start gap-2">
                <Badge
                  className="text-white text-[10px] px-1.5 py-0 h-[18px] font-bold rounded-md mt-0.5 shrink-0"
                  style={{
                    backgroundColor: getTransportColor(dep.transportType),
                  }}
                >
                  {dep.route}
                </Badge>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-foreground/85 font-semibold">
                      {dep.destination}
                    </span>
                    <span className="font-bold text-foreground/90 tabular-nums shrink-0">
                      {formatEta(dep.secondsUntilArrival)}
                    </span>
                  </div>

                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${delayTone(dep.delaySeconds)}`}
                    >
                      {formatDelayBadge(dep.delaySeconds)}
                    </span>

                    {dep.stopSequence != null && dep.totalStops != null && dep.totalStops > 0 && (
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-foreground/65 bg-foreground/[0.05]">
                        {Math.max(dep.totalStops - dep.stopSequence, 0)} stops left
                      </span>
                    )}

                    {(dep.alertsCount ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-amber-800 bg-amber-50">
                        <AlertTriangle size={10} />
                        {dep.alertsCount} alert{dep.alertsCount === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
