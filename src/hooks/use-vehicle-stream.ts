"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import type { VehicleDto } from "@/lib/types";

interface StreamData {
  vehicles: VehicleDto[];
  count: number;
  timestamp: string;
}

export function useVehicleStream(
  lineFilter: string,
  typeFilter: string,
  enabled: boolean = true,
) {
  const [allVehicles, setAllVehicles] = useState<VehicleDto[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      setAllVehicles([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const es = new EventSource("/api/vehicles/stream");
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data: StreamData = JSON.parse(event.data);
        setAllVehicles(data.vehicles);
        setLastUpdate(new Date(data.timestamp));
        setLoading(false);
      } catch (err) {
        console.error("SSE parse error:", err);
      }
    };

    es.onerror = () => {
      console.warn("SSE connection error, reconnecting...");
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [enabled]);

  const vehicles = useMemo(() => {
    if (!lineFilter && (!typeFilter || typeFilter === "all")) {
      return allVehicles;
    }

    return allVehicles.filter((v) => {
      if (lineFilter && v.lineNumber !== lineFilter) return false;
      if (typeFilter && typeFilter !== "all") {
        if (typeFilter === "bus" && v.transportType !== "bus") return false;
        if (typeFilter === "tram" && v.transportType !== "tram") return false;
        if (typeFilter === "trolleybus" && v.transportType !== "trolleybus")
          return false;
        if (typeFilter === "train" && v.transportType !== "train") return false;
      }
      return true;
    });
  }, [allVehicles, lineFilter, typeFilter]);

  return { vehicles, lastUpdate, loading };
}
