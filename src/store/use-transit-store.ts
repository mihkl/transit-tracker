import { create } from "zustand";
import type { MultiRoutePlanResponse, PlannedRoute, RoutePlanResponse, StopDto } from "@/lib/types";
import type { LineType } from "@/lib/domain";
import type { Overlay } from "@/lib/navigation";
import {
  resolveMultiRoutePlan,
  resolveRoutePlan,
  type MultiRouteCache,
  type RoutingMode,
  type RouteCache,
} from "@/lib/route-filter";
import { toLocalDateTimeString } from "@/lib/format-utils";

type SelectedLine = { lineNumber: string; type: LineType } | null;
export type PlannerPoint = { lat: number; lng: number; name?: string } | null;
type PickingPoint = string | null;
type TimeOption = "now" | "depart" | "arrive";

export interface PlannerStop {
  id: string;
  point: PlannerPoint;
  dwellMinutes: number;
  departureOverride: string;
}

let plannerStopCounter = 0;

function buildPlannerStopId() {
  plannerStopCounter += 1;
  return `planner-stop-${plannerStopCounter}`;
}

export function createPlannerStop(overrides: Partial<PlannerStop> = {}): PlannerStop {
  return {
    id: overrides.id ?? buildPlannerStopId(),
    point: overrides.point ?? null,
    dwellMinutes: overrides.dwellMinutes ?? 0,
    departureOverride: overrides.departureOverride ?? "",
  };
}

function createInitialPlannerStops() {
  return [createPlannerStop(), createPlannerStop()];
}

interface TransitStoreState {
  selectedLine: SelectedLine;
  selectedStop: StopDto | null;
  showTraffic: boolean;
  showVehicles: boolean;
  showStops: boolean;
  showPlanner: boolean;
  plannerStops: PlannerStop[];
  pickingPoint: PickingPoint;
  routePlan: RoutePlanResponse | null;
  multiRoutePlan: MultiRoutePlanResponse | null;
  planError: string | null;
  routeCache: RouteCache;
  multiRouteCache: MultiRouteCache;
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
  setPlannerStops: (stops: PlannerStop[]) => void;
  setPickingPoint: (point: PickingPoint) => void;
  setRoutePlan: (plan: RoutePlanResponse | null) => void;
  setMultiRoutePlan: (plan: MultiRoutePlanResponse | null) => void;
  setPlanError: (error: string | null) => void;
  setRouteCache: (cache: RouteCache) => void;
  setMultiRouteCache: (cache: MultiRouteCache) => void;
  setRoutingMode: (mode: RoutingMode) => void;
  setPlanLoading: (loading: boolean) => void;
  setSelectedRouteIndex: (index: number) => void;
  bumpRouteFitRequest: () => void;
  setFocusedVehicleId: (vehicleId: string | null) => void;
  setOpenSelectedRouteDetails: (open: boolean) => void;
  restoreRouteSnapshot: (route: PlannedRoute) => void;
  setTimeOption: (option: TimeOption) => void;
  setSelectedDateTime: (value: string) => void;
  setActiveOverlay: (overlay: Overlay) => void;
  setShowMobileLayers: (show: boolean) => void;
  bumpMapKey: () => void;
  clearPlanner: () => void;
}

type TransitStore = TransitStoreState & TransitStoreActions;

function createEmptyRouteCache(): RouteCache {
  return { fastest: null, lessWalking: null, fewerTransfers: null };
}

function createEmptyMultiRouteCache(): MultiRouteCache {
  return { fastest: null, lessWalking: null, fewerTransfers: null };
}

function getInitialState() {
  const state: TransitStoreState = {
    selectedLine: null,
    selectedStop: null,
    showTraffic: false,
    showVehicles: false,
    showStops: false,
    showPlanner: false,
    plannerStops: createInitialPlannerStops(),
    pickingPoint: null,
    routePlan: null,
    multiRoutePlan: null,
    planError: null,
    routeCache: createEmptyRouteCache(),
    multiRouteCache: createEmptyMultiRouteCache(),
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
  setPlannerStops: (plannerStops) => set({ plannerStops }),
  setPickingPoint: (pickingPoint) => set({ pickingPoint }),
  setRoutePlan: (routePlan) => set({ routePlan }),
  setMultiRoutePlan: (multiRoutePlan) => set({ multiRoutePlan }),
  setPlanError: (planError) => set({ planError }),
  setRouteCache: (routeCache) => set({ routeCache }),
  setMultiRouteCache: (multiRouteCache) => set({ multiRouteCache }),
  setRoutingMode: (mode) =>
    set((state) => ({
      routingMode: mode,
      routePlan: resolveRoutePlan(state.routeCache, mode) ?? state.routePlan,
      multiRoutePlan: resolveMultiRoutePlan(state.multiRouteCache, mode) ?? state.multiRoutePlan,
      selectedRouteIndex: 0,
    })),
  setPlanLoading: (planLoading) => set({ planLoading }),
  setSelectedRouteIndex: (selectedRouteIndex) => set({ selectedRouteIndex }),
  bumpRouteFitRequest: () => set((state) => ({ routeFitRequest: state.routeFitRequest + 1 })),
  setFocusedVehicleId: (focusedVehicleId) => set({ focusedVehicleId }),
  setOpenSelectedRouteDetails: (openSelectedRouteDetails) => set({ openSelectedRouteDetails }),
  restoreRouteSnapshot: (route) =>
    set({
      showPlanner: true,
      plannerStops: createInitialPlannerStops(),
      routePlan: { routes: [route] },
      multiRoutePlan: null,
      selectedRouteIndex: 0,
      openSelectedRouteDetails: true,
    }),
  setTimeOption: (timeOption) => set({ timeOption }),
  setSelectedDateTime: (selectedDateTime) => set({ selectedDateTime }),
  setActiveOverlay: (activeOverlay) => set({ activeOverlay }),
  setShowMobileLayers: (showMobileLayers) => set({ showMobileLayers }),
  bumpMapKey: () => set((state) => ({ mapKey: state.mapKey + 1 })),
  clearPlanner: () =>
    set({
      plannerStops: createInitialPlannerStops(),
      pickingPoint: null,
      routePlan: null,
      multiRoutePlan: null,
      planError: null,
      routeCache: createEmptyRouteCache(),
      multiRouteCache: createEmptyMultiRouteCache(),
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
