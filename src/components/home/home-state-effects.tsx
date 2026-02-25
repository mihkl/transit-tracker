"use client";

import { useEffect } from "react";
import { useTransitStore } from "@/store/use-transit-store";
import type { PlannedRoute, RoutePlanResponse } from "@/lib/types";

const ROUTE_SNAPSHOT_KEY = "transit-reminder-route-snapshot";
const SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

interface StoredRouteSnapshot {
  route: PlannedRoute;
  savedAt: number;
}

export function HomeStateEffects() {
  const setShowPlanner = useTransitStore((s) => s.setShowPlanner);
  const setRoutePlan = useTransitStore((s) => s.setRoutePlan);
  const setSelectedRouteIndex = useTransitStore((s) => s.setSelectedRouteIndex);
  const setOpenSelectedRouteDetails = useTransitStore((s) => s.setOpenSelectedRouteDetails);
  const setMobileTab = useTransitStore((s) => s.setMobileTab);
  const bumpMapKey = useTransitStore((s) => s.bumpMapKey);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("trip") !== "1") return;

    try {
      const raw = localStorage.getItem(ROUTE_SNAPSHOT_KEY);
      if (!raw) return;
      const snapshot = JSON.parse(raw) as StoredRouteSnapshot;
      const isFresh = snapshot?.savedAt && Date.now() - snapshot.savedAt <= SNAPSHOT_MAX_AGE_MS;
      const hasLegs = Array.isArray(snapshot?.route?.legs);
      if (!isFresh || !hasLegs) return;

      setShowPlanner(true);
      setRoutePlan({ routes: [snapshot.route] } as RoutePlanResponse);
      setSelectedRouteIndex(0);
      setOpenSelectedRouteDetails(true);
      setMobileTab("directions");
    } catch {
      // Ignore malformed snapshot.
    } finally {
      params.delete("trip");
      const next = params.toString();
      const nextUrl = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`;
      window.history.replaceState({}, "", nextUrl);
    }
  }, [setMobileTab, setOpenSelectedRouteDetails, setRoutePlan, setSelectedRouteIndex, setShowPlanner]);

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
