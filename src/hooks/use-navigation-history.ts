"use client";

import { useEffect, useRef } from "react";
import { useTransitStore, type MobileTab } from "@/store/use-transit-store";

interface NavHistoryState {
  _nav: true; // discriminator so we ignore unrelated popstate events
  tab: MobileTab;
  hasLine: boolean;
  hasStop: boolean;
  routeDetailsOpen: boolean;
}

function captureNavState(): NavHistoryState {
  const s = useTransitStore.getState();
  return {
    _nav: true,
    tab: s.mobileTab,
    hasLine: s.selectedLine !== null,
    hasStop: s.selectedStop !== null,
    routeDetailsOpen: s.openSelectedRouteDetails,
  };
}

function statesEqual(a: NavHistoryState, b: NavHistoryState) {
  return (
    a.tab === b.tab &&
    a.hasLine === b.hasLine &&
    a.hasStop === b.hasStop &&
    a.routeDetailsOpen === b.routeDetailsOpen
  );
}

export function useNavigationHistory() {
  const isHandlingPopState = useRef(false);
  const lastPushed = useRef<NavHistoryState | null>(null);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const initial = captureNavState();
    window.history.replaceState(initial, "");
    lastPushed.current = initial;
  }, []);

  useEffect(() => {
    const unsub = useTransitStore.subscribe(() => {
      if (isHandlingPopState.current) return;

      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(() => {
        pushTimer.current = null;
        const next = captureNavState();

        if (lastPushed.current && statesEqual(lastPushed.current, next)) return;

        window.history.pushState(next, "");
        lastPushed.current = next;
      }, 16);
    });

    return () => {
      unsub();
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, []);

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const navState = e.state as NavHistoryState | null;
      isHandlingPopState.current = true;

      try {
        const store = useTransitStore.getState();

        if (!navState?._nav) {
          store.goToMapTab();
          store.setSelectedLine(null);
          store.setSelectedStop(null);
          store.setOpenSelectedRouteDetails(false);
          lastPushed.current = captureNavState();
          return;
        }

        if (navState.tab !== store.mobileTab) {
          if (navState.tab === "map") {
            store.goToMapTab();
          } else {
            store.setMobileTab(navState.tab);
            if (navState.tab === "directions") {
              store.setShowPlanner(true);
            }
          }
        }

        if (!navState.hasLine && store.selectedLine !== null) {
          store.setSelectedLine(null);
        }
        if (!navState.hasStop && store.selectedStop !== null) {
          store.setSelectedStop(null);
        }

        if (!navState.routeDetailsOpen && store.openSelectedRouteDetails) {
          store.setOpenSelectedRouteDetails(false);
        }

        lastPushed.current = navState;
      } finally {
        isHandlingPopState.current = false;
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
}
