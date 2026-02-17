import { useState, useEffect, useRef, useCallback } from "react";

export interface TrafficFlowTileInfo {
  tileUrlTemplate: string;
  attribution: string;
  maxZoom: number;
  minZoom: number;
}

export interface TrafficIncidentData {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: {
      type: "Point";
      coordinates: number[];
    };
    properties: {
      id: string;
      type: string;
      iconCategory: number;
      description: string;
      delay: number | null;
      magnitude: number;
      startTime: string | null;
      endTime: string | null;
      roadNumbers: string[];
    };
  }>;
}

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

const EMPTY_FEATURE_COLLECTION = {
  type: "FeatureCollection" as const,
  features: [],
};

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

  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const flowTileInfoRef = useRef<TrafficFlowTileInfo | null>(null);

  const fetchTrafficData = useCallback(async () => {
    if (!bounds || zoom < minZoom) {
      setState((prev) => ({
        ...prev,
        incidents: null,
        loading: false,
      }));
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const signal = abortControllerRef.current.signal;

      const promises: Promise<Response>[] = [];
      const needsFlow = !flowTileInfoRef.current;

      if (needsFlow) {
        promises.push(fetch("/api/traffic/flow", { signal }));
      }

      promises.push(
        fetch(
          `/api/traffic/incidents?minLat=${bounds.minLat}&minLng=${bounds.minLng}&maxLat=${bounds.maxLat}&maxLng=${bounds.maxLng}`,
          { signal },
        ),
      );

      const responses = await Promise.all(promises);

      if (signal.aborted) return;

      let flowTileInfo = flowTileInfoRef.current;
      let incidentsData = EMPTY_FEATURE_COLLECTION;

      let responseIndex = 0;

      if (needsFlow) {
        const flowRes = responses[responseIndex++];
        if (flowRes.ok) {
          flowTileInfo = await flowRes.json();
          flowTileInfoRef.current = flowTileInfo;
        } else {
          console.error("[useTrafficData] Flow API error:", flowRes.status);
        }
      }

      const incidentsRes = responses[responseIndex];
      if (incidentsRes.ok) {
        incidentsData = await incidentsRes.json();
      } else {
        console.error(
          "[useTrafficData] Incidents API error:",
          incidentsRes.status,
        );
      }

      setState({
        flowTileInfo,
        incidents: incidentsData,
        loading: false,
        error: null,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      console.error("Failed to fetch traffic data:", err);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: "Failed to fetch traffic data",
      }));
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
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [enabled, fetchTrafficData, debounceMs]);

  if (!enabled) {
    return DEFAULT_STATE;
  }
  return state;
}
