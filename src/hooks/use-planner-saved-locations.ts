"use client";

import { useCallback, useMemo } from "react";
import { useSavedPlannerItems } from "@/hooks/use-saved-planner-items";

export function usePlannerSavedLocations() {
  const savedItems = useSavedPlannerItems();

  const allSavedLocations = useMemo(() => {
    return savedItems.locations.map((location) => ({
      lat: location.lat,
      lng: location.lng,
      name: location.name,
      nickname: location.nickname,
    }));
  }, [savedItems.locations]);

  const isLocationSaved = useCallback(
    (lat: number, lng: number) => {
      return savedItems.locations.some(
        (location) =>
          Math.abs(location.lat - lat) < 0.0001 && Math.abs(location.lng - lng) < 0.0001,
      );
    },
    [savedItems.locations],
  );

  const handleSaveLocation = useCallback(
    async (point: { lat: number; lng: number; name: string }, nickname?: string) => {
      await savedItems.saveLocation(point, nickname);
    },
    [savedItems],
  );

  return {
    savedItems,
    allSavedLocations,
    isLocationSaved,
    handleSaveLocation,
  };
}
