"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useStops } from "@/hooks/use-stops";
import { getStopArrivals } from "@/actions";
import type { StopDto, StopArrival } from "@/lib/types";

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface NearbyStop {
  stop: StopDto;
  distanceMeters: number;
  arrivals: StopArrival[];
  loading: boolean;
}

export function useNearbyStops(
  userLocation: { lat: number; lng: number } | null,
  count = 5,
  refreshMs = 15_000,
) {
  const { stops } = useStops();
  const [results, setResults] = useState<NearbyStop[]>([]);
  const [loading, setLoading] = useState(false);

  const nearest = useMemo(() => {
    if (!userLocation || stops.length === 0) return [];
    return stops
      .map((stop) => ({
        stop,
        distanceMeters: haversineMeters(
          userLocation.lat,
          userLocation.lng,
          stop.latitude,
          stop.longitude,
        ),
      }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, count);
  }, [userLocation, stops, count]);

  const refresh = useCallback(async () => {
    if (nearest.length === 0) return;
    setLoading(true);
    const fetched = await Promise.all(
      nearest.map(async ({ stop, distanceMeters }) => {
        try {
          const arrivals = await getStopArrivals(stop.stopId);
          return { stop, distanceMeters, arrivals, loading: false };
        } catch {
          return { stop, distanceMeters, arrivals: [] as StopArrival[], loading: false };
        }
      }),
    );
    setResults(fetched);
    setLoading(false);
  }, [nearest]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, refreshMs);
    return () => clearInterval(id);
  }, [refresh, refreshMs]);

  return { nearbyStops: results, loading };
}
