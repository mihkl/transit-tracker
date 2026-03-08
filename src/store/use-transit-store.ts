import { create } from "zustand";
import type { RoutePlanResponse, StopDto } from "@/lib/types";
import type { LineType } from "@/lib/domain";
import type { Overlay } from "@/lib/navigation";
import { resolveRoutePlan, type RoutingMode, type RouteCache } from "@/lib/route-filter";
import { toLocalDateTimeString } from "@/lib/format-utils";

export type SelectedLine = { lineNumber: string; type: LineType } | null;
export type PlannerPoint = { lat: number; lng: number; name?: string } | null;
export type PickingPoint = "origin" | "destination" | null;
export type TimeOption = "now" | "depart" | "arrive";

interface TransitStoreState {
  selectedLine: SelectedLine;
  selectedStop: StopDto | null;
  showTraffic: boolean;
  showVehicles: boolean;
  showStops: boolean;
  showPlanner: boolean;
  origin: PlannerPoint;
  destination: PlannerPoint;
  pickingPoint: PickingPoint;
  routePlan: RoutePlanResponse | null;
  planError: string | null;
  routeCache: RouteCache;
  routingMode: RoutingMode;
  planLoading: boolean;
  selectedRouteIndex: number;
  routeFitRequest: number;
  focusedVehicleId: string | null;
  openSelectedRouteDetails: boolean;
  timeOption: TimeOption;
  selectedDateTime: string;
  activeOverlay: Overlay;
  showMobileLayers: boolean;
  mapKey: number;
}

interface TransitStoreActions {
  setSelectedLine: (line: SelectedLine) => void;
  setSelectedStop: (stop: StopDto | null) => void;
  toggleTraffic: () => void;
  setShowVehicles: (show: boolean) => void;
  toggleVehicles: () => void;
  toggleStops: () => void;
  setShowPlanner: (show: boolean) => void;
  setOrigin: (point: PlannerPoint) => void;
  setDestination: (point: PlannerPoint) => void;
  setPickingPoint: (point: PickingPoint) => void;
  setRoutePlan: (plan: RoutePlanResponse | null) => void;
  setPlanError: (error: string | null) => void;
  setRouteCache: (cache: RouteCache) => void;
  setRoutingMode: (mode: RoutingMode) => void;
  setPlanLoading: (loading: boolean) => void;
  setSelectedRouteIndex: (index: number) => void;
  bumpRouteFitRequest: () => void;
  setFocusedVehicleId: (vehicleId: string | null) => void;
  setOpenSelectedRouteDetails: (open: boolean) => void;
  setTimeOption: (option: TimeOption) => void;
  setSelectedDateTime: (value: string) => void;
  setActiveOverlay: (overlay: Overlay) => void;
  setShowMobileLayers: (show: boolean) => void;
  bumpMapKey: () => void;
  clearPlanner: () => void;
}

type TransitStore = TransitStoreState & TransitStoreActions;

function getInitialState() {
  const state: TransitStoreState = {
    selectedLine: null,
    selectedStop: null,
    showTraffic: false,
    showVehicles: false,
    showStops: false,
    showPlanner: false,
    origin: null,
    destination: null,
    pickingPoint: null,
    routePlan: null,
    planError: null,
    routeCache: { fastest: null, lessWalking: null, fewerTransfers: null },
    routingMode: "fastest",
    planLoading: false,
    selectedRouteIndex: 0,
    routeFitRequest: 0,
    focusedVehicleId: null,
    openSelectedRouteDetails: false,
    timeOption: "now",
    selectedDateTime: toLocalDateTimeString(new Date()),
    activeOverlay: null,
    showMobileLayers: false,
    mapKey: 0,
  };
  return state;
}

const initialState = getInitialState();

export const useTransitStore = create<TransitStore>((set) => ({
  ...initialState,
  setSelectedLine: (selectedLine) => set({ selectedLine }),
  setSelectedStop: (selectedStop) => set({ selectedStop }),
  toggleTraffic: () => set((state) => ({ showTraffic: !state.showTraffic })),
  setShowVehicles: (showVehicles) => set({ showVehicles }),
  toggleVehicles: () => set((state) => ({ showVehicles: !state.showVehicles })),
  toggleStops: () => set((state) => ({ showStops: !state.showStops })),
  setShowPlanner: (showPlanner) => set({ showPlanner }),
  setOrigin: (origin) => set({ origin }),
  setDestination: (destination) => set({ destination }),
  setPickingPoint: (pickingPoint) => set({ pickingPoint }),
  setRoutePlan: (routePlan) => set({ routePlan }),
  setPlanError: (planError) => set({ planError }),
  setRouteCache: (routeCache) => set({ routeCache }),
  setRoutingMode: (mode) =>
    set((state) => ({
      routingMode: mode,
      routePlan: resolveRoutePlan(state.routeCache, mode) ?? state.routePlan,
      selectedRouteIndex: 0,
    })),
  setPlanLoading: (planLoading) => set({ planLoading }),
  setSelectedRouteIndex: (selectedRouteIndex) => set({ selectedRouteIndex }),
  bumpRouteFitRequest: () => set((state) => ({ routeFitRequest: state.routeFitRequest + 1 })),
  setFocusedVehicleId: (focusedVehicleId) => set({ focusedVehicleId }),
  setOpenSelectedRouteDetails: (openSelectedRouteDetails) => set({ openSelectedRouteDetails }),
  setTimeOption: (timeOption) => set({ timeOption }),
  setSelectedDateTime: (selectedDateTime) => set({ selectedDateTime }),
  setActiveOverlay: (activeOverlay) => set({ activeOverlay }),
  setShowMobileLayers: (showMobileLayers) => set({ showMobileLayers }),
  bumpMapKey: () => set((state) => ({ mapKey: state.mapKey + 1 })),
  clearPlanner: () =>
    set({
      origin: null,
      destination: null,
      pickingPoint: null,
      routePlan: null,
      planError: null,
      routeCache: { fastest: null, lessWalking: null, fewerTransfers: null },
      planLoading: false,
      selectedRouteIndex: 0,
      selectedLine: null,
      selectedStop: null,
      focusedVehicleId: null,
      timeOption: "now",
      selectedDateTime: toLocalDateTimeString(new Date()),
      openSelectedRouteDetails: false,
    }),
}));
