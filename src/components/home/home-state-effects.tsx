"use client";

import { useEffect, useCallback } from "react";
import { useTransitStore } from "@/store/use-transit-store";
import { useHashRouter } from "@/hooks/use-hash-router";
import { navigateTo } from "@/lib/navigation";
import { clearStoredActiveTrip, loadStoredActiveTrip } from "@/hooks/use-leave-reminder";

function restoreStoredTrip(showUnavailableBanner = true) {
  const activeTrip = loadStoredActiveTrip();
  if (activeTrip) {
    const { restoreRouteSnapshot } = useTransitStore.getState();
    restoreRouteSnapshot(activeTrip.snapshot.route, activeTrip.snapshot.plannerStops);
    useTransitStore.getState().setHasActiveTrip(true);
    navigateTo("directions");
    return true;
  }

  clearStoredActiveTrip();
  useTransitStore.getState().setHasActiveTrip(false);
  if (showUnavailableBanner) {
    useTransitStore.getState().setTripBanner({
      type: "unavailable",
      message: "Your trip details are no longer available.",
    });
    navigateTo("directions");
  }
  return false;
}

export function HomeStateEffects() {
  const bumpMapKey = useTransitStore((s) => s.bumpMapKey);
  const setHasActiveTrip = useTransitStore((s) => s.setHasActiveTrip);

  useHashRouter();

  const syncActiveTripState = useCallback(() => {
    const activeTrip = loadStoredActiveTrip();
    setHasActiveTrip(!!activeTrip);
  }, [setHasActiveTrip]);

  // Cold start: restore from ?trip=1 URL param
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    syncActiveTripState();
    if (params.get("trip") !== "1") return;

    // Strip ?trip=1 immediately regardless of outcome
    params.delete("trip");
    const next = params.toString();
    const hash = window.location.hash;
    const nextUrl = `${window.location.pathname}${next ? `?${next}` : ""}${hash}`;
    window.history.replaceState(window.history.state, "", nextUrl);

    restoreStoredTrip(true);
  }, [syncActiveTripState]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const handler = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | undefined;
      if (data?.type !== "trip-reminder") return;
      restoreStoredTrip(true);
    };

    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    const sync = () => syncActiveTripState();
    sync();
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [syncActiveTripState]);

  useEffect(() => {
    const STALE_MS = 5 * 60 * 1000;
    let hiddenAt: number | null = null;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
      } else if (hiddenAt !== null && Date.now() - hiddenAt > STALE_MS) {
        bumpMapKey();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [bumpMapKey]);

  return null;
}
