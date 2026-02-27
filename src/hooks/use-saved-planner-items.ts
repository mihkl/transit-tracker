"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteSavedLocation,
  deleteSavedRoute,
  listSavedLocations,
  listSavedRoutes,
  supportsPlannerPersistence,
  updateLocationNickname,
  upsertSavedLocation,
  upsertSavedRoute,
  type PlannerPointValue,
  type SavedLocationRecord,
  type SavedRouteRecord,
} from "@/lib/planner-persistence";

interface SavedPlannerItemsState {
  routes: SavedRouteRecord[];
  locations: SavedLocationRecord[];
  loading: boolean;
  mutating: boolean;
  error: string | null;
  supported: boolean;
}

const INITIAL_STATE: SavedPlannerItemsState = {
  routes: [],
  locations: [],
  loading: true,
  mutating: false,
  error: null,
  supported: false,
};

export function useSavedPlannerItems() {
  const [state, setState] = useState<SavedPlannerItemsState>(INITIAL_STATE);

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    if (!supportsPlannerPersistence()) {
      setState((prev) => ({
        ...prev,
        loading: false,
        supported: false,
        error: "Saved routes are not supported in this browser.",
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      loading: options?.silent ? prev.loading : true,
      error: null,
      supported: true,
    }));

    try {
      const [routes, locations] = await Promise.all([listSavedRoutes(), listSavedLocations()]);
      setState((prev) => ({
        ...prev,
        routes,
        locations,
        loading: false,
        error: null,
        supported: true,
      }));
    } catch {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: "Could not load saved items.",
        supported: true,
      }));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runMutation = useCallback(async (action: () => Promise<void>): Promise<boolean> => {
    setState((prev) => ({ ...prev, mutating: true, error: null }));
    try {
      await action();
      await refresh({ silent: true });
      return true;
    } catch {
      setState((prev) => ({ ...prev, mutating: false, error: "Could not update saved items." }));
      return false;
    } finally {
      setState((prev) => ({ ...prev, mutating: false }));
    }
  }, [refresh]);

  const saveRoute = useCallback(
    async (origin: PlannerPointValue, destination: PlannerPointValue) =>
      runMutation(async () => {
        await upsertSavedRoute(origin, destination);
      }),
    [runMutation],
  );

  const saveLocation = useCallback(
    async (point: PlannerPointValue, nickname?: string) =>
      runMutation(async () => {
        await upsertSavedLocation(point, nickname);
      }),
    [runMutation],
  );

  const updateNickname = useCallback(
    async (id: string, nickname: string) =>
      runMutation(async () => {
        await updateLocationNickname(id, nickname);
      }),
    [runMutation],
  );

  const removeRoute = useCallback(
    async (id: string) =>
      runMutation(async () => {
        await deleteSavedRoute(id);
      }),
    [runMutation],
  );

  const removeLocation = useCallback(
    async (id: string) =>
      runMutation(async () => {
        await deleteSavedLocation(id);
      }),
    [runMutation],
  );

  return useMemo(
    () => ({
      routes: state.routes,
      locations: state.locations,
      loading: state.loading,
      mutating: state.mutating,
      error: state.error,
      supported: state.supported,
      refresh,
      saveRoute,
      saveLocation,
      removeRoute,
      removeLocation,
      updateNickname,
    }),
    [
      refresh,
      removeLocation,
      removeRoute,
      saveLocation,
      saveRoute,
      updateNickname,
      state.error,
      state.loading,
      state.locations,
      state.mutating,
      state.routes,
      state.supported,
    ],
  );
}
