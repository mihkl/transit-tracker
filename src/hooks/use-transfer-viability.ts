"use client";

import { useState, useEffect, useRef } from "react";
import type { PlannedRoute, RouteLeg, DelayInfo } from "@/lib/types";
import { parseDurationSeconds } from "@/lib/route-time";
import { fetchLegDelayAsync } from "@/lib/leg-delay";

export type TransferStatus = "safe" | "tight" | "missed" | "unknown";

export interface TransferInfo {
  arrivingLeg: RouteLeg;
  departingLeg: RouteLeg;
  bufferSeconds: number;
  status: TransferStatus;
  walkSeconds: number;
}

const POLL_INTERVAL_MS = 20_000;
const TIGHT_THRESHOLD_S = 180;

function computeTransfers(
  route: PlannedRoute,
  liveDelays: Map<RouteLeg, DelayInfo | null>,
) {
  const result: TransferInfo[] = [];

  for (let i = 0; i < route.legs.length - 1; i++) {
    const leg = route.legs[i];
    if (leg.mode === "WALK") continue;

    let walkSeconds = 0;
    let nextTransitLeg: RouteLeg | null = null;

    for (let j = i + 1; j < route.legs.length; j++) {
      if (route.legs[j].mode === "WALK") {
        walkSeconds += parseDurationSeconds(route.legs[j].duration);
      } else {
        nextTransitLeg = route.legs[j];
        break;
      }
    }

    if (!nextTransitLeg) continue;

    const delay1 = liveDelays.has(leg) ? liveDelays.get(leg) : leg.delay;
    const delay2 = liveDelays.has(nextTransitLeg)
      ? liveDelays.get(nextTransitLeg)
      : nextTransitLeg.delay;

    const hasLiveDelay1 = !!delay1 && delay1.status !== "unknown";
    const hasLiveDelay2 = !!delay2 && delay2.status !== "unknown";

    if (!leg.scheduledArrival || !nextTransitLeg.scheduledDeparture || !hasLiveDelay1 || !hasLiveDelay2) {
      result.push({
        arrivingLeg: leg,
        departingLeg: nextTransitLeg,
        bufferSeconds: 0,
        status: "unknown",
        walkSeconds,
      });
      continue;
    }

    const d1 = delay1.estimatedDelaySeconds;
    const d2 = delay2.estimatedDelaySeconds;
    const arrMs = new Date(leg.scheduledArrival).getTime() + d1 * 1000;
    const depMs = new Date(nextTransitLeg.scheduledDeparture).getTime() + d2 * 1000;
    const bufferSeconds = Math.round((depMs - arrMs) / 1000) - walkSeconds;

    const status: TransferStatus =
      bufferSeconds < 0 ? "missed" : bufferSeconds < TIGHT_THRESHOLD_S ? "tight" : "safe";

    result.push({
      arrivingLeg: leg,
      departingLeg: nextTransitLeg,
      bufferSeconds,
      status,
      walkSeconds,
    });
  }

  return result;
}

export function useTransferViability(route: PlannedRoute | null) {
  const [transfers, setTransfers] = useState<TransferInfo[]>([]);
  const pollRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function runAsync() {
      if (!route) {
        if (!cancelled) setTransfers([]);
        return;
      }

      const currentRoute = route;
      const transitLegs = currentRoute.legs.filter((l) => l.mode !== "WALK");
      if (transitLegs.length < 2) {
        if (!cancelled) setTransfers([]);
        return;
      }

      const liveDelays = new Map<RouteLeg, DelayInfo | null>(
        transitLegs.map((leg) => [leg, leg.delay ?? null]),
      );

      if (!cancelled) setTransfers(computeTransfers(currentRoute, liveDelays));

      async function pollAsync() {
        await Promise.all(
          transitLegs.map(async (leg) => {
            const delay = await fetchLegDelayAsync(leg);
            liveDelays.set(leg, delay);
          }),
        );
        if (!cancelled) setTransfers(computeTransfers(currentRoute, liveDelays));
      }

      pollRef.current = pollAsync;
      await pollAsync();
      if (cancelled) return;
      intervalId = setInterval(pollAsync, POLL_INTERVAL_MS);
    }

    runAsync();

    const handleVisibility = () => {
      if (!document.hidden) pollRef.current?.();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      pollRef.current = null;
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [route]);

  return transfers;
}
