"use client";

import { useSyncExternalStore } from "react";
import { isReliableUserLocation } from "@/lib/location-quality";

type UserLocation = { lat: number; lng: number } | null;

let currentLocation: UserLocation = null;
let watchId: number | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const cb of listeners) cb();
}

function startWatch() {
  if (watchId !== null) return;
  if (typeof navigator === "undefined" || !navigator.geolocation) return;

  watchId = navigator.geolocation.watchPosition(
    ({ coords }) => {
      if (!isReliableUserLocation(coords)) return;
      currentLocation = { lat: coords.latitude, lng: coords.longitude };
      emit();
    },
    (err) => console.warn("Geolocation error:", err.message),
    { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
  );
}

function stopWatch() {
  if (watchId === null) return;
  if (typeof navigator !== "undefined" && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId);
  }
  watchId = null;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  startWatch();
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) stopWatch();
  };
}

function getSnapshot() {
  return currentLocation;
}

function getServerSnapshot() {
  return null;
}

export function useUserLocation(): UserLocation {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
