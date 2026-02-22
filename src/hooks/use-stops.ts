"use client";

import { useEffect, useState } from "react";
import { getAllStops } from "@/actions";
import type { StopDto } from "@/lib/types";

let stopsCache: StopDto[] | null = null;
let inflight: Promise<StopDto[]> | null = null;

async function loadStops(): Promise<StopDto[]> {
  if (stopsCache) return stopsCache;
  if (!inflight) {
    inflight = getAllStops()
      .then((data) => {
        stopsCache = data;
        return data;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function useStops() {
  const [stops, setStops] = useState<StopDto[]>(() => stopsCache ?? []);
  const [loading, setLoading] = useState(!stopsCache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (stopsCache) return;

    loadStops()
      .then((data) => {
        if (cancelled) return;
        setStops(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load stops:", err);
        setError("Failed to load stops");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { stops, loading, error };
}
