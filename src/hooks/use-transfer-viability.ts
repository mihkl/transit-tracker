"use client";

import { useState, useEffect, useRef } from "react";
import type { PlannedRoute, RouteLeg, DelayInfo } from "@/lib/types";
import { getLegDelay } from "@/actions";

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

function parseDurationSeconds(duration?: string): number {
  if (!duration) return 0;
  const match = duration.match(/(\d+)s/);
  return match ? parseInt(match[1], 10) : 0;
}

async function fetchLegDelay(leg: RouteLeg): Promise<DelayInfo | null> {
  try {
    return await getLegDelay({
      line: leg.lineNumber,
      type: leg.mode,
      depStop: leg.departureStop,
      depLat: leg.departureStopLat,
      depLng: leg.departureStopLng,
      arrStop: leg.arrivalStop,
      arrLat: leg.arrivalStopLat,
      arrLng: leg.arrivalStopLng,
      scheduledDep: leg.scheduledDeparture,
    });
  } catch {
    return null;
  }
}

function computeTransfers(
  route: PlannedRoute,
  liveDelays: Map<RouteLeg, DelayInfo | null>,
): TransferInfo[] {
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

    if (!leg.scheduledArrival || !nextTransitLeg.scheduledDeparture) {
      result.push({
        arrivingLeg: leg,
        departingLeg: nextTransitLeg,
        bufferSeconds: 0,
        status: "unknown",
        walkSeconds,
      });
      continue;
    }

    const d1 = delay1?.estimatedDelaySeconds ?? 0;
    const d2 = delay2?.estimatedDelaySeconds ?? 0;
    const arrMs = new Date(leg.scheduledArrival).getTime() + d1 * 1000;
    const depMs =
      new Date(nextTransitLeg.scheduledDeparture).getTime() + d2 * 1000;
    const bufferSeconds = Math.round((depMs - arrMs) / 1000) - walkSeconds;

    const status: TransferStatus =
      bufferSeconds < 0
        ? "missed"
        : bufferSeconds < TIGHT_THRESHOLD_S
          ? "tight"
          : "safe";

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

export function useTransferViability(
  route: PlannedRoute | null,
): TransferInfo[] {
  const [transfers, setTransfers] = useState<TransferInfo[]>([]);
  const pollRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function run() {
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

      async function poll() {
        await Promise.all(
          transitLegs.map(async (leg) => {
            const delay = await fetchLegDelay(leg);
            liveDelays.set(leg, delay);
          }),
        );
        if (!cancelled) setTransfers(computeTransfers(currentRoute, liveDelays));
      }

      pollRef.current = poll;
      await poll();
      if (cancelled) return;
      intervalId = setInterval(poll, POLL_INTERVAL_MS);
    }

    run();

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
