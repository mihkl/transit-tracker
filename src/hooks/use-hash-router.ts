"use client";

import { useEffect } from "react";
import { useTransitStore } from "@/store/use-transit-store";
import { parseOverlay, seedOverlayHistoryState } from "@/lib/navigation";

/**
 * Syncs the browser hash with the Zustand `activeOverlay` state.
 * On mount reads the current hash; on popstate (back/forward) updates the store.
 */
export function useHashRouter() {
  useEffect(() => {
    seedOverlayHistoryState();

    // Seed store from the URL hash on first load
    const initial = parseOverlay(window.location.hash);
    useTransitStore.getState().setActiveOverlay(initial);

    const handlePopState = () => {
      const overlay = parseOverlay(window.location.hash);
      useTransitStore.getState().setActiveOverlay(overlay);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
}
