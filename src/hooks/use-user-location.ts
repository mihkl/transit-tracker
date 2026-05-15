"use client";

import { useSyncExternalStore } from "react";
import { isReliableUserLocation } from "@/lib/location-quality";

export type UserLocation = {
  lat: number;
  lng: number;
  heading: number | null;
} | null;

let currentLocation: UserLocation = null;
let currentDeviceHeading: number | null = null;
let watchingDeviceHeading = false;
const listeners = new Set<() => void>();

function emit() {
  for (const cb of listeners) cb();
}

function normalizeHeading(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return ((value % 360) + 360) % 360;
}

function resolveLocationHeading(coords: GeolocationCoordinates) {
  return currentDeviceHeading ?? normalizeHeading(coords.heading);
}

type DeviceOrientationEventWithCompass = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
};

type DeviceOrientationEventConstructorWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<PermissionState>;
};

function getDeviceOrientationEventConstructor() {
  if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return null;
  return window.DeviceOrientationEvent as DeviceOrientationEventConstructorWithPermission;
}

function readDeviceHeading(event: DeviceOrientationEventWithCompass) {
  const iosHeading = normalizeHeading(event.webkitCompassHeading);
  if (iosHeading !== null) return iosHeading;

  if (event.absolute && typeof event.alpha === "number") {
    return normalizeHeading(360 - event.alpha);
  }

  return null;
}

function handleDeviceOrientation(event: DeviceOrientationEvent) {
  const heading = readDeviceHeading(event as DeviceOrientationEventWithCompass);
  if (heading === null) return;

  currentDeviceHeading = heading;
  if (!currentLocation || currentLocation.heading === heading) return;

  currentLocation = { ...currentLocation, heading };
  emit();
}

function startDeviceHeadingWatch() {
  if (watchingDeviceHeading || typeof window === "undefined") return;

  window.addEventListener("deviceorientation", handleDeviceOrientation, true);
  watchingDeviceHeading = true;
}

export async function requestUserHeadingPermission() {
  const DeviceOrientation = getDeviceOrientationEventConstructor();

  try {
    await DeviceOrientation?.requestPermission?.();
  } catch {
    // Heading is optional; MapLibre geolocation should continue without it.
  }

  startDeviceHeadingWatch();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot() {
  return currentLocation;
}

function getServerSnapshot() {
  return null;
}

function mapGeolocationError(err: GeolocationPositionError) {
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

export function requestUserLocation(options?: { acceptCoarse?: boolean }) {
  const acceptCoarse = options?.acceptCoarse ?? false;

  return new Promise<void>((resolve, reject) => {
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
        currentLocation = {
          lat: coords.latitude,
          lng: coords.longitude,
          heading: resolveLocationHeading(coords),
        };
        startDeviceHeadingWatch();
        emit();
        resolve();
      },
      (err) => reject(new Error(mapGeolocationError(err))),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );
  });
}

export function updateUserLocationFromGeolocation(position: GeolocationPosition) {
  const { coords } = position;
  if (!isReliableUserLocation(coords)) return;
  startDeviceHeadingWatch();

  currentLocation = {
    lat: coords.latitude,
    lng: coords.longitude,
    heading: resolveLocationHeading(coords),
  };
  emit();
}

export function useUserLocation() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
