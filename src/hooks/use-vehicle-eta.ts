"use client";

import { useEffect, useState } from "react";
import type { VehicleDto } from "@/lib/types";
import { getStopArrivalsAsync } from "@/actions";

async function fetchArrivalsAsync(stopId: string) {
  return getStopArrivalsAsync(stopId);
}

export function useVehicleEta(popupVehicle: VehicleDto | null) {
  const [vehicleEtaState, setVehicleEtaState] = useState<{
    vehicleId: string;
    value: number | null;
  } | null>(null);

  useEffect(() => {
    const stopId = popupVehicle?.nextStop?.stopId;
    if (!popupVehicle || !popupVehicle.isOnRoute || !stopId) return;

    const lineNumber = popupVehicle.lineNumber;
    const vehicleId = popupVehicle.id;
    let cancelled = false;

    const fetchEtaAsync = async () => {
      try {
        const arrivals = await fetchArrivalsAsync(stopId);
        if (cancelled) return;
        const match = arrivals.find((arrival) => arrival.route === lineNumber);
        setVehicleEtaState({
          vehicleId,
          value: match?.secondsUntilArrival ?? null,
        });
      } catch {
        if (!cancelled) {
          setVehicleEtaState({
            vehicleId,
            value: null,
          });
        }
      }
    };

    void fetchEtaAsync();
    const intervalId = setInterval(fetchEtaAsync, 5_000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [popupVehicle]);

  const stopId = popupVehicle?.nextStop?.stopId;
  if (!popupVehicle || !popupVehicle.isOnRoute || !stopId) return null;
  if (!vehicleEtaState || vehicleEtaState.vehicleId !== popupVehicle.id) return null;
  return vehicleEtaState.value;
}
