"use client";

import { useEffect, useCallback } from "react";
import { useTransitStore } from "@/store/use-transit-store";
import { useHashRouter } from "@/hooks/use-hash-router";
import { navigateTo } from "@/lib/navigation";
import type { StoredRouteSnapshot } from "@/hooks/use-leave-reminder";

const ROUTE_SNAPSHOT_KEY = "transit-reminder-route-snapshot";
const SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function loadValidSnapshot(): StoredRouteSnapshot | null {
  try {
    const raw = localStorage.getItem(ROUTE_SNAPSHOT_KEY);
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as StoredRouteSnapshot;
    const isFresh = snapshot?.savedAt && Date.now() - snapshot.savedAt <= SNAPSHOT_MAX_AGE_MS;
    const hasLegs = Array.isArray(snapshot?.route?.legs);
    if (!isFresh || !hasLegs) return null;
    return snapshot;
  } catch {
    return null;
  }
}

function restoreFromSnapshot(snapshot: StoredRouteSnapshot) {
  const { restoreRouteSnapshot } = useTransitStore.getState();
  restoreRouteSnapshot(snapshot.route, snapshot.plannerStops);
  navigateTo("directions");
}

export function HomeStateEffects() {
  const bumpMapKey = useTransitStore((s) => s.bumpMapKey);
  const setTripBanner = useTransitStore((s) => s.setTripBanner);

  useHashRouter();

  // Cold start: restore from ?trip=1 URL param
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("trip") !== "1") return;

    // Strip ?trip=1 immediately regardless of outcome
    params.delete("trip");
    const next = params.toString();
    const hash = window.location.hash;
    const nextUrl = `${window.location.pathname}${next ? `?${next}` : ""}${hash}`;
    window.history.replaceState(window.history.state, "", nextUrl);

    const snapshot = loadValidSnapshot();
    if (snapshot) {
      restoreFromSnapshot(snapshot);
    } else {
      setTripBanner({
        type: "unavailable",
        message: "Your trip details are no longer available.",
      });
      navigateTo("directions");
    }
  }, [setTripBanner]);

  // Warm start: listen for SW postMessage when notification is tapped while app is open
  const handleTripBannerTap = useCallback(() => {
    const snapshot = loadValidSnapshot();
    if (snapshot) {
      restoreFromSnapshot(snapshot);
    } else {
      useTransitStore.getState().setTripBanner({
        type: "unavailable",
        message: "Your trip details are no longer available.",
      });
      navigateTo("directions");
    }
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const handler = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | undefined;
      if (data?.type !== "trip-reminder") return;

      // Show a non-disruptive banner instead of force-navigating
      setTripBanner({
        type: "reminder",
        message: "Time to leave — tap to view your trip",
        onTap: handleTripBannerTap,
      });
    };

    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [setTripBanner, handleTripBannerTap]);

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
