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

function mapGeolocationError(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "Location permission was denied.";
    case err.POSITION_UNAVAILABLE:
      return "Location is unavailable right now.";
    case err.TIMEOUT:
      return "Location request timed out. Try again.";
    default:
      return "Could not get your location.";
  }
}

export function requestUserLocation(options?: { acceptCoarse?: boolean }): Promise<void> {
  const acceptCoarse = options?.acceptCoarse ?? false;

  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation is not supported in this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const reliable = isReliableUserLocation(coords);
        if (!reliable && !acceptCoarse) {
          reject(new Error("Location accuracy is too low. Try again outdoors."));
          return;
        }
        currentLocation = { lat: coords.latitude, lng: coords.longitude };
        emit();
        startWatch();
        resolve();
      },
      (err) => reject(new Error(mapGeolocationError(err))),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );
  });
}

export function useUserLocation(): UserLocation {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
