import { create } from "zustand";
import type { RoutePlanResponse, StopDto } from "@/lib/types";

export type SelectedLine = { lineNumber: string; type: string } | null;
export type PlannerPoint = { lat: number; lng: number; name?: string } | null;
export type PickingPoint = "origin" | "destination" | null;
export type TimeOption = "now" | "depart" | "arrive";
export type MobileTab = "map" | "search" | "nearby" | "directions" | "layers";

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
  planLoading: boolean;
  selectedRouteIndex: number;
  routeFitRequest: number;
  focusedVehicleId: number | null;
  openSelectedRouteDetails: boolean;
  timeOption: TimeOption;
  selectedDateTime: string;
  mobileTab: MobileTab;
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
  setPlanLoading: (loading: boolean) => void;
  setSelectedRouteIndex: (index: number) => void;
  bumpRouteFitRequest: () => void;
  setFocusedVehicleId: (vehicleId: number | null) => void;
  setOpenSelectedRouteDetails: (open: boolean) => void;
  setTimeOption: (option: TimeOption) => void;
  setSelectedDateTime: (value: string) => void;
  setMobileTab: (tab: MobileTab) => void;
  handleMobileTabChange: (tab: MobileTab) => void;
  goToMapTab: () => void;
  setShowMobileLayers: (show: boolean) => void;
  toggleShowMobileLayers: () => void;
  bumpMapKey: () => void;
  clearPlanner: () => void;
}

type TransitStore = TransitStoreState & TransitStoreActions;

export function toLocalDateTimeString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getInitialState(): TransitStoreState {
  return {
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
    planLoading: false,
    selectedRouteIndex: 0,
    routeFitRequest: 0,
    focusedVehicleId: null,
    openSelectedRouteDetails: false,
    timeOption: "now",
    selectedDateTime: toLocalDateTimeString(new Date()),
    mobileTab: "map",
    showMobileLayers: false,
    mapKey: 0,
  };
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
  setPlanLoading: (planLoading) => set({ planLoading }),
  setSelectedRouteIndex: (selectedRouteIndex) => set({ selectedRouteIndex }),
  bumpRouteFitRequest: () => set((state) => ({ routeFitRequest: state.routeFitRequest + 1 })),
  setFocusedVehicleId: (focusedVehicleId) => set({ focusedVehicleId }),
  setOpenSelectedRouteDetails: (openSelectedRouteDetails) => set({ openSelectedRouteDetails }),
  setTimeOption: (timeOption) => set({ timeOption }),
  setSelectedDateTime: (selectedDateTime) => set({ selectedDateTime }),
  setMobileTab: (mobileTab) => set({ mobileTab }),
  handleMobileTabChange: (tab) =>
    set((state) => {
      if (tab === "layers") {
        return { showMobileLayers: !state.showMobileLayers };
      }
      return {
        mobileTab: tab,
        showMobileLayers: false,
        ...(tab === "directions" ? { showPlanner: true } : {}),
      };
    }),
  goToMapTab: () => set({ mobileTab: "map", showMobileLayers: false }),
  setShowMobileLayers: (showMobileLayers) => set({ showMobileLayers }),
  toggleShowMobileLayers: () =>
    set((state) => ({ showMobileLayers: !state.showMobileLayers })),
  bumpMapKey: () => set((state) => ({ mapKey: state.mapKey + 1 })),
  clearPlanner: () =>
    set({
      origin: null,
      destination: null,
      pickingPoint: null,
      routePlan: null,
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
