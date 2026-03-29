"use client";

import { useCallback, useEffect, useState } from "react";
import type { StopArrival, StopDto } from "@/lib/types";
import { getStopArrivalsAsync } from "@/actions";
import { captureUnexpectedError } from "@/lib/monitoring";

async function fetchArrivalsAsync(stopId: string) {
  return getStopArrivalsAsync(stopId);
}

export function useStopPopupArrivals(stop: StopDto | null) {
  const [stopArrivals, setStopArrivals] = useState<StopArrival[]>([]);
  const [arrivalsLoading, setArrivalsLoading] = useState(false);

  const loadStopArrivalsAsync = useCallback(async (stop: StopDto) => {
    setArrivalsLoading(true);
    setStopArrivals([]);

    try {
      setStopArrivals(await fetchArrivalsAsync(stop.stopId));
    } catch (err) {
      captureUnexpectedError(err, {
        area: "stop-arrivals",
        extra: { stopId: stop.stopId, phase: "open" },
      });
    } finally {
      setArrivalsLoading(false);
    }
  }, []);

  const clearStopArrivals = useCallback(() => {
    setStopArrivals([]);
    setArrivalsLoading(false);
  }, []);

  useEffect(() => {
    if (!stop) return;

    const refreshAsync = async () => {
      try {
        setStopArrivals(await fetchArrivalsAsync(stop.stopId));
      } catch (err) {
        captureUnexpectedError(err, {
          area: "stop-arrivals",
          extra: { stopId: stop.stopId, phase: "refresh" },
        });
      }
    };

    const intervalId = setInterval(refreshAsync, 5_000);

    const handleVisibility = () => {
      if (!document.hidden) {
        void refreshAsync();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [stop]);

  return {
    stopArrivals,
    arrivalsLoading,
    loadStopArrivalsAsync,
    clearStopArrivals,
  };
}
