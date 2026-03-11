"use client";

import { useEffect, useCallback } from "react";
import { X, Bell, AlertTriangle } from "lucide-react";
import { useTransitStore } from "@/store/use-transit-store";
import { navigateTo } from "@/lib/navigation";
import { clearStoredActiveTrip, loadStoredActiveTrip } from "@/hooks/use-leave-reminder";

function restoreStoredTrip() {
  const activeTrip = loadStoredActiveTrip();
  if (!activeTrip) {
    clearStoredActiveTrip();
    useTransitStore.getState().setHasActiveTrip(false);
    useTransitStore.getState().setTripBanner({
      type: "unavailable",
      message: "Your trip details are no longer available.",
    });
    navigateTo("directions");
    return;
  }

  const { restoreRouteSnapshot } = useTransitStore.getState();
  restoreRouteSnapshot(activeTrip.snapshot.route, activeTrip.snapshot.plannerStops);
  useTransitStore.getState().setHasActiveTrip(true);
  navigateTo("directions");
}

function PersistentActiveTripBanner() {
  const hasActiveTrip = useTransitStore((s) => s.hasActiveTrip);

  const handleOpenTrip = useCallback(() => {
    restoreStoredTrip();
  }, []);

  if (!hasActiveTrip) return null;

  return (
    <div className="rounded-2xl border border-primary/25 bg-primary/95 px-4 py-3 text-white shadow-lg backdrop-blur-sm">
      <button
        type="button"
        onClick={handleOpenTrip}
        className="flex w-full items-center gap-3 text-left cursor-pointer"
      >
        <Bell size={18} className="shrink-0" fill="currentColor" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Active trip</div>
          <div className="text-xs text-white/80">Tap to reopen live trip details</div>
        </div>
      </button>
    </div>
  );
}

function TransientTripBanner() {
  const tripBanner = useTransitStore((s) => s.tripBanner);
  const setTripBanner = useTransitStore((s) => s.setTripBanner);

  useEffect(() => {
    if (!tripBanner || tripBanner.type !== "unavailable") return;
    const id = setTimeout(() => useTransitStore.getState().setTripBanner(null), 5000);
    return () => clearTimeout(id);
  }, [tripBanner]);

  if (!tripBanner) return null;

  const isReminder = tripBanner.type === "reminder";
  const isUnavailable = tripBanner.type === "unavailable";

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-lg backdrop-blur-sm ${
        isReminder
          ? "bg-primary/95 border-primary/30 text-white cursor-pointer"
          : isUnavailable
            ? "bg-yellow-50/95 border-yellow-200 text-yellow-800"
            : "bg-red-50/95 border-red-200 text-red-800"
      }`}
      onClick={() => {
        if (tripBanner.onTap) {
          tripBanner.onTap();
          setTripBanner(null);
        }
      }}
    >
      {isReminder ? (
        <Bell size={18} className="shrink-0" fill="currentColor" />
      ) : (
        <AlertTriangle size={18} className="shrink-0" />
      )}
      <span className="flex-1 text-sm font-medium">{tripBanner.message}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setTripBanner(null);
        }}
        className={`shrink-0 rounded-full p-1 transition-colors ${
          isReminder ? "hover:bg-white/20" : "hover:bg-black/5"
        }`}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function TripBanner() {
  return (
    <div className="fixed top-14 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
      <PersistentActiveTripBanner />
      <TransientTripBanner />
    </div>
  );
}
