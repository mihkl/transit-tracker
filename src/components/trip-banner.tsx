"use client";

import { useEffect, useCallback } from "react";
import { X, Navigation, AlertTriangle } from "lucide-react";
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
    <button
      type="button"
      onClick={handleOpenTrip}
      className="group flex w-full items-center gap-2.5 cursor-pointer rounded-full bg-foreground/85 backdrop-blur-xl px-2 py-1.5 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.3)] transition-all duration-200 hover:bg-foreground/90 hover:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.4)] active:scale-[0.97]"
    >
      <span className="relative flex items-center justify-center w-7 h-7 rounded-full bg-primary/20">
        <Navigation size={13} className="text-primary-foreground" fill="currentColor" />
        <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-foreground/85 animate-pulse" />
      </span>
      <span className="text-[13px] font-semibold text-white tracking-tight pr-1">
        Active trip
      </span>
      <svg
        className="w-4 h-4 text-white/50 group-hover:text-white/80 transition-colors shrink-0 mr-0.5"
        viewBox="0 0 16 16"
        fill="none"
      >
        <path
          d="M6 4l4 4-4 4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
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
      className={`flex items-center gap-2.5 rounded-full px-2 py-1.5 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.3)] backdrop-blur-xl transition-all duration-200 ${
        isReminder
          ? "bg-foreground/85 text-white cursor-pointer hover:bg-foreground/90 active:scale-[0.97]"
          : isUnavailable
            ? "bg-amber-50/95 border border-amber-200/60 text-amber-800"
            : "bg-red-50/95 border border-red-200/60 text-red-800"
      }`}
      onClick={() => {
        if (tripBanner.onTap) {
          tripBanner.onTap();
          setTripBanner(null);
        }
      }}
    >
      {isReminder ? (
        <span className="relative flex items-center justify-center w-7 h-7 rounded-full bg-primary/20 shrink-0">
          <Navigation size={13} className="text-primary-foreground" fill="currentColor" />
          <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-foreground/85 animate-pulse" />
        </span>
      ) : (
        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-current/10 shrink-0">
          <AlertTriangle size={13} />
        </span>
      )}
      <span className="flex-1 text-[13px] font-semibold tracking-tight truncate">{tripBanner.message}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setTripBanner(null);
        }}
        className={`shrink-0 rounded-full p-1 transition-colors ${
          isReminder ? "hover:bg-white/20" : "hover:bg-black/10"
        }`}
      >
        <X size={13} />
      </button>
    </div>
  );
}

export function TripBanner() {
  return (
    <div className="fixed z-50 above-bottom-nav left-3 md:bottom-6 md:left-auto md:right-6 w-auto max-w-55 space-y-2 animate-in fade-in slide-in-from-bottom-3 md:slide-in-from-bottom-3 duration-300">
      <PersistentActiveTripBanner />
      <TransientTripBanner />
    </div>
  );
}
