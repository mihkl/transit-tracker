import { useState, useEffect, useRef, useCallback } from "react";
import {
  getTrafficFlow,
  getTrafficIncidents,
  type TrafficFlowTileInfo,
  type TrafficIncidentCollection as TrafficIncidentData,
} from "@/actions";

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
): TrafficDataState {
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
      const [flowResult, incidentsResult] = await Promise.all([
        needsFlow ? getTrafficFlow() : Promise.resolve(null),
        getTrafficIncidents(bounds),
      ]);

      if (fetchGenRef.current !== gen) return;

      if (needsFlow && flowResult) {
        flowTileInfoRef.current = flowResult;
      }

      setState({
        flowTileInfo: flowTileInfoRef.current,
        incidents: incidentsResult,
        loading: false,
        error: null,
      });
    } catch (err) {
      if (fetchGenRef.current !== gen) return;
      console.error("Failed to fetch traffic data:", err);
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
