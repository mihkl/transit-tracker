"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import type { VehicleDto } from "@/lib/types";
import type { TypeFilter } from "@/lib/domain";
import { vehicleStreamEventSchema } from "@/lib/schemas";
import { captureExpectedMessage, captureUnexpectedError } from "@/lib/monitoring";

export function useVehicleStream(
  lineFilter: string,
  typeFilter: TypeFilter,
  enabled: boolean = true,
) {
  const [allVehicles, setAllVehicles] = useState<VehicleDto[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const streamErrorCountRef = useRef(0);
  const streamOutageReportedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    if (!enabled) {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      Promise.resolve().then(() => {
        if (!cancelled) {
          setAllVehicles([]);
          setLoading(false);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    function connect() {
      eventSourceRef.current?.close();
      setLoading(true);
      const es = new EventSource("/api/vehicles/stream");
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const parsed = vehicleStreamEventSchema.safeParse(JSON.parse(event.data));
          if (!parsed.success) return;
          setAllVehicles(parsed.data.vehicles as VehicleDto[]);
          setLastUpdate(new Date(parsed.data.timestamp));
          setLoading(false);
          streamErrorCountRef.current = 0;
          streamOutageReportedRef.current = false;
        } catch (err) {
          captureUnexpectedError(err, { area: "vehicles-stream", extra: { phase: "parse" } });
        }
      };

      es.onerror = () => {
        streamErrorCountRef.current += 1;
        if (streamErrorCountRef.current >= 3 && !streamOutageReportedRef.current) {
          streamOutageReportedRef.current = true;
          captureExpectedMessage("Vehicle stream connection is unstable", {
            area: "vehicles-stream",
            extra: { consecutiveErrors: streamErrorCountRef.current },
          });
        }
      };
    }

    connect();

    const handleVisibility = () => {
      if (!document.hidden && eventSourceRef.current?.readyState === EventSource.CLOSED) connect();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [enabled]);

  const vehicles = useMemo(() => {
    if (!lineFilter && (!typeFilter || typeFilter === "all")) {
      return allVehicles;
    }

    return allVehicles.filter((v) => {
      if (typeFilter && typeFilter !== "all" && v.transportType !== typeFilter) return false;
      if (lineFilter && v.lineNumber !== lineFilter) return false;
      return true;
    });
  }, [allVehicles, lineFilter, typeFilter]);

  return { vehicles, lastUpdate, loading };
}
