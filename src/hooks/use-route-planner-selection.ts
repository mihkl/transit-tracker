"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlannedRoute, RoutePlanResponse } from "@/lib/types";

interface UseRoutePlannerSelectionParams {
  routePlan: RoutePlanResponse | null;
  selectedRouteIndex: number;
  onSelectRoute: (index: number) => void;
  openSelectedRouteDetails: boolean;
  onConsumeOpenSelectedRouteDetails?: () => void;
}

export function useRoutePlannerSelection({
  routePlan,
  selectedRouteIndex,
  onSelectRoute,
  openSelectedRouteDetails,
  onConsumeOpenSelectedRouteDetails,
}: UseRoutePlannerSelectionParams) {
  const [expandedRoute, setExpandedRoute] = useState<number | null>(null);
  const [mobileDetail, setMobileDetail] = useState<number | null>(null);
  const detailSheetRef = useRef<HTMLDivElement | null>(null);
  const lastDetailSheetHeightRef = useRef(0);

  const hasRoutes = !!routePlan?.routes?.length;
  const selectedRoute = routePlan?.routes[selectedRouteIndex] ?? null;
  const mobileDetailRoute: PlannedRoute | null =
    mobileDetail !== null && hasRoutes ? routePlan.routes[mobileDetail] : null;

  const handleRouteClick = useCallback(
    (index: number) => {
      onSelectRoute(index);
      setExpandedRoute((previous) => (previous === index ? null : index));
    },
    [onSelectRoute],
  );

  const handleMobileRouteClick = useCallback(
    (index: number) => {
      onSelectRoute(index);
      setMobileDetail(index);
    },
    [onSelectRoute],
  );

  const closeMobileDetail = useCallback(() => {
    setMobileDetail(null);
  }, []);

  useEffect(() => {
    if (!openSelectedRouteDetails || !hasRoutes || !routePlan) return;
    let cancelled = false;

    Promise.resolve().then(() => {
      if (cancelled) return;
      const index =
        selectedRouteIndex >= 0 && selectedRouteIndex < routePlan.routes.length
          ? selectedRouteIndex
          : 0;
      onSelectRoute(index);
      setExpandedRoute(index);
      setMobileDetail(index);
      onConsumeOpenSelectedRouteDetails?.();
    });

    return () => {
      cancelled = true;
    };
  }, [
    openSelectedRouteDetails,
    hasRoutes,
    routePlan,
    selectedRouteIndex,
    onSelectRoute,
    onConsumeOpenSelectedRouteDetails,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!mobileDetailRoute) {
      document.documentElement.style.removeProperty("--mobile-route-sheet-height");
      lastDetailSheetHeightRef.current = 0;
      return;
    }

    const element = detailSheetRef.current;
    if (!element) return;

    const applyHeight = (height: number) => {
      const rounded = Math.max(0, Math.round(height));
      document.documentElement.style.setProperty("--mobile-route-sheet-height", `${rounded}px`);
      if (Math.abs(rounded - lastDetailSheetHeightRef.current) > 8) {
        lastDetailSheetHeightRef.current = rounded;
        onSelectRoute(selectedRouteIndex);
      }
    };

    applyHeight(element.getBoundingClientRect().height);
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        applyHeight(entry.contentRect.height);
      }
    });
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
      document.documentElement.style.removeProperty("--mobile-route-sheet-height");
      lastDetailSheetHeightRef.current = 0;
    };
  }, [mobileDetailRoute, onSelectRoute, selectedRouteIndex]);

  return {
    hasRoutes,
    selectedRoute,
    expandedRoute,
    mobileDetailRoute,
    detailSheetRef,
    handleRouteClick,
    handleMobileRouteClick,
    closeMobileDetail,
  };
}
