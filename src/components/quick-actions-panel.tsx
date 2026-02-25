"use client";

import { useState } from "react";
import { useNearbyStops } from "@/hooks/use-nearby-stops";
import { requestUserLocation, useUserLocation } from "@/hooks/use-user-location";
import { TYPE_COLORS } from "@/lib/constants";
import { LocateFixed } from "lucide-react";
import type { StopDto } from "@/lib/types";
import { useTransitStore } from "@/store/use-transit-store";

const STOP_TYPE_MAP: Record<string, string> = {
  B: "bus",
  T: "tram",
  O: "trolleybus",
  R: "train",
};

function stopAccentColor(stop: StopDto): string {
  const code = stop.lines?.[0]?.[0];
  if (!code) return "#6b7280";
  const type = STOP_TYPE_MAP[code];
  return type ? TYPE_COLORS[type] || "#6b7280" : "#6b7280";
}

export function QuickActionsPanel() {
  const setSelectedLine = useTransitStore((s) => s.setSelectedLine);
  const setSelectedStop = useTransitStore((s) => s.setSelectedStop);
  const goToMapTab = useTransitStore((s) => s.goToMapTab);
  const [requestingLocation, setRequestingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const userLocation = useUserLocation();
  const { nearbyStops, loading } = useNearbyStops(userLocation, 5, 15_000);

  /* ── No location ─────────────────────────────────────── */
  if (!userLocation) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <LocateFixed className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-lg font-bold text-foreground/90 mb-2">
          Find nearby stops
        </h3>
        <p className="text-[15px] text-foreground/55 mb-6 max-w-[280px] leading-relaxed">
          Enable location access to see stops and live arrivals near you
        </p>
        <button
          onClick={async () => {
            if (requestingLocation) return;
            setLocationError(null);
            setRequestingLocation(true);
            try {
              await requestUserLocation({ acceptCoarse: true });
            } catch (err) {
              setLocationError(err instanceof Error ? err.message : "Could not get your location.");
            } finally {
              setRequestingLocation(false);
            }
          }}
          disabled={requestingLocation}
          className="h-14 px-8 bg-primary text-white text-base font-bold rounded-2xl active:scale-[0.97] transition-transform"
        >
          {requestingLocation ? "Locating..." : "Enable Location"}
        </button>
        {locationError && (
          <p className="mt-3 text-sm text-red-600 font-medium">{locationError}</p>
        )}
      </div>
    );
  }

  /* ── Loading (first fetch) ───────────────────────────── */
  if (loading && nearbyStops.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  /* ── Results ─────────────────────────────────────────── */
  return (
    <div className="px-4 pb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-foreground/90">Nearby Stops</h3>
        {loading && (
          <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
        )}
      </div>

      <div className="space-y-3">
        {nearbyStops.map(({ stop, distanceMeters, arrivals }) => {
          const color = stopAccentColor(stop);

          return (
            <button
              key={stop.stopId}
              onClick={() => {
                setSelectedLine(null);
                setSelectedStop(stop);
                goToMapTab();
              }}
              className="w-full text-left rounded-2xl border border-foreground/8 bg-white p-4 min-h-[80px] active:scale-[0.98] transition-all duration-150"
              style={{ borderLeftWidth: 4, borderLeftColor: color }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[16px] font-bold text-foreground/90 truncate">
                    {stop.stopName}
                  </div>
                  <div className="text-[14px] text-foreground/50 font-medium mt-0.5">
                    {Math.round(distanceMeters)} m away
                    {stop.stopArea && ` · ${stop.stopArea}`}
                  </div>
                </div>
              </div>

              {arrivals.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {arrivals.slice(0, 4).map((arr, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-foreground/[0.04]"
                    >
                      <span
                        className="text-[11px] font-bold text-white px-1.5 py-0.5 rounded-md"
                        style={{
                          backgroundColor:
                            TYPE_COLORS[arr.transportType] || "#6b7280",
                        }}
                      >
                        {arr.route}
                      </span>
                      <span className="text-[15px] font-bold text-foreground/80 tabular-nums">
                        {arr.secondsUntilArrival < 60
                          ? "<1 min"
                          : `${Math.floor(arr.secondsUntilArrival / 60)} min`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {arrivals.length === 0 && (
                <div className="mt-3 text-[14px] text-foreground/40 font-medium">
                  No upcoming arrivals
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
