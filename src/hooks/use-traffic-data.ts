import { useState, useEffect, useRef, useCallback } from "react";
import {
  getTrafficFlowAsync,
  getTrafficIncidentsAsync,
  type TrafficFlowTileInfo,
  type TrafficIncidentCollection as TrafficIncidentData,
} from "@/actions";
import { getBrowserClientId } from "@/lib/browser-client-id";

export type { TrafficFlowTileInfo, TrafficIncidentData };

interface TrafficDataState {
  flowTileInfo: TrafficFlowTileInfo | null;
  incidents: TrafficIncidentData | null;
  loading: boolean;
  error: string | null;
}

interface UseTrafficDataOptions {
  enabled?: boolean;
  minZoom?: number;
  debounceMs?: number;
}

const DEFAULT_STATE: TrafficDataState = {
  flowTileInfo: null,
  incidents: null,
  loading: false,
  error: null,
};

export function useTrafficData(
  bounds: {
    minLat: number;
    minLng: number;
    maxLat: number;
    maxLng: number;
  } | null,
  zoom: number,
  options: UseTrafficDataOptions = {},
) {
  const { enabled = true, minZoom = 11, debounceMs = 400 } = options;

  const [state, setState] = useState<TrafficDataState>(DEFAULT_STATE);

  const fetchGenRef = useRef(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const flowTileInfoRef = useRef<TrafficFlowTileInfo | null>(null);

  const fetchTrafficData = useCallback(async () => {
    if (!bounds || zoom < minZoom) {
      setState((prev) => ({ ...prev, incidents: null, loading: false }));
      return;
    }

    const gen = ++fetchGenRef.current;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const needsFlow = !flowTileInfoRef.current;
      const [flowResult, incidentsResult] = await Promise.allSettled([
        needsFlow ? getTrafficFlowAsync() : Promise.resolve(flowTileInfoRef.current),
        getTrafficIncidentsAsync(bounds, getBrowserClientId() ?? undefined),
      ]);

      if (fetchGenRef.current !== gen) return;

      if (flowResult.status === "fulfilled" && flowResult.value) {
        flowTileInfoRef.current = flowResult.value;
      }

      const incidents =
        incidentsResult.status === "fulfilled" ? incidentsResult.value.data : null;
      const incidentsError =
        incidentsResult.status === "fulfilled" ? incidentsResult.value.error : "Failed to fetch traffic data";

      setState({
        flowTileInfo: flowTileInfoRef.current,
        incidents,
        loading: false,
        error:
          flowTileInfoRef.current || incidents ? incidentsError : "Failed to fetch traffic data",
      });
    } catch {
      if (fetchGenRef.current !== gen) return;
      setState((prev) => ({ ...prev, loading: false, error: "Failed to fetch traffic data" }));
    }
  }, [bounds, zoom, minZoom]);

  useEffect(() => {
    if (!enabled) {
      flowTileInfoRef.current = null;
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchTrafficData();
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [enabled, fetchTrafficData, debounceMs]);

  if (!enabled) {
    return DEFAULT_STATE;
  }
  return state;
}
