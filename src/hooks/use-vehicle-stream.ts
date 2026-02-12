"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { VehicleDto } from "@/lib/types";

interface StreamData {
  vehicles: VehicleDto[];
  count: number;
  timestamp: string;
}

export function useVehicleStream(lineFilter: string, typeFilter: string) {
  const [vehicles, setVehicles] = useState<VehicleDto[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const params = new URLSearchParams();
    if (lineFilter) params.set("line", lineFilter);
    if (typeFilter && typeFilter !== "all") params.set("type", typeFilter);

    const url = `/api/vehicles/stream?${params}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data: StreamData = JSON.parse(event.data);
        setVehicles(data.vehicles);
        setLastUpdate(new Date(data.timestamp));
        setLoading(false);
      } catch (err) {
        console.error("SSE parse error:", err);
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects, just log
      console.warn("SSE connection error, reconnecting...");
    };
  }, [lineFilter, typeFilter]);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [connect]);

  return { vehicles, lastUpdate, loading };
}
