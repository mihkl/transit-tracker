"use client";

import { useEffect } from "react";
import { X, Bell, AlertTriangle } from "lucide-react";
import { useTransitStore } from "@/store/use-transit-store";

export function TripBanner() {
  const tripBanner = useTransitStore((s) => s.tripBanner);
  const setTripBanner = useTransitStore((s) => s.setTripBanner);

  // Auto-dismiss "unavailable" banners after 5s
  useEffect(() => {
    if (!tripBanner || tripBanner.type !== "unavailable") return;
    const id = setTimeout(() => useTransitStore.getState().setTripBanner(null), 5000);
    return () => clearTimeout(id);
  }, [tripBanner]);

  if (!tripBanner) return null;

  const isReminder = tripBanner.type === "reminder";
  const isUnavailable = tripBanner.type === "unavailable";

  return (
    <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md animate-in fade-in slide-in-from-top-2 duration-300">
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
            isReminder
              ? "hover:bg-white/20"
              : "hover:bg-black/5"
          }`}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
