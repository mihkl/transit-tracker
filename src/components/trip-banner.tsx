"use client";

import { useEffect } from "react";
import { X, Navigation, AlertTriangle } from "lucide-react";
import { useTransitStore } from "@/store/use-transit-store";
import { navigateTo } from "@/lib/navigation";
import { clearStoredActiveTrip, loadStoredActiveTrip } from "@/hooks/use-leave-reminder";
import { useIsDesktop } from "@/hooks/use-is-desktop";

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

  if (!hasActiveTrip) return null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={restoreStoredTrip}
      onKeyDown={(e) => { if (e.key === "Enter") restoreStoredTrip(); }}
      className="group flex items-center gap-2 cursor-pointer rounded-xl border border-foreground/10 bg-white/95 backdrop-blur-md h-12 pl-2.5 pr-1.5 shadow-lg transition-all duration-150 hover:shadow-xl hover:border-primary/25 active:scale-[0.97]"
    >
      <span className="relative flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 shrink-0">
        <Navigation size={13} className="text-primary" fill="currentColor" />
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-[1.5px] ring-white" />
      </span>
      <span className="text-xs font-semibold text-foreground/80 whitespace-nowrap">Active trip</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          clearStoredActiveTrip();
          useTransitStore.getState().setHasActiveTrip(false);
        }}
        className="shrink-0 rounded-full p-1 transition-colors hover:bg-foreground/10 text-foreground/30 hover:text-foreground/60"
        aria-label="Dismiss active trip"
      >
        <X size={13} />
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
      className={`flex items-center gap-2 rounded-xl border h-12 pl-2.5 pr-1.5 shadow-lg backdrop-blur-md transition-all duration-150 ${
        isReminder
          ? "border-foreground/10 bg-white/95 text-foreground cursor-pointer hover:shadow-xl hover:border-primary/25 active:scale-[0.97]"
          : isUnavailable
            ? "bg-amber-50/95 border-amber-200/60 text-amber-800"
            : "bg-red-50/95 border-red-200/60 text-red-800"
      }`}
      onClick={() => {
        if (tripBanner.onTap) {
          tripBanner.onTap();
          setTripBanner(null);
        }
      }}
    >
      {isReminder ? (
        <span className="relative flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 shrink-0">
          <Navigation size={13} className="text-primary" fill="currentColor" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-[1.5px] ring-white" />
        </span>
      ) : (
        <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-current/10 shrink-0">
          <AlertTriangle size={13} />
        </span>
      )}
      <span className="flex-1 text-xs font-medium truncate">{tripBanner.message}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setTripBanner(null);
        }}
        className="shrink-0 rounded-full p-1 transition-colors hover:bg-foreground/5"
      >
        <X size={13} />
      </button>
    </div>
  );
}

export function TripBanner() {
  const hasActiveTrip = useTransitStore((s) => s.hasActiveTrip);
  const isDesktop = useIsDesktop();

  // Periodically check if the trip has ended and auto-dismiss
  useEffect(() => {
    if (!hasActiveTrip) return;
    const id = setInterval(() => {
      const trip = loadStoredActiveTrip();
      if (!trip) {
        useTransitStore.getState().setHasActiveTrip(false);
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [hasActiveTrip]);

  return (
    <div
      className="fixed z-50 left-1/2 -translate-x-1/2 space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-300"
      style={{
        bottom: isDesktop
          ? "1.5rem"
          : "max(calc(5rem + env(safe-area-inset-bottom, 0px)), calc(var(--mobile-bottom-sheet-offset, 0px) + 0.75rem + env(safe-area-inset-bottom, 0px)))",
      }}
    >
      <PersistentActiveTripBanner />
      <TransientTripBanner />
    </div>
  );
}
