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
let smoothedHeading: number | null = null;
let headingStaleTimer: ReturnType<typeof setTimeout> | null = null;
let watchingDeviceHeading = false;
const listeners = new Set<() => void>();

const DEVICE_HEADING_STALE_MS = 4_000;
const HEADING_JITTER_DEGREES = 2;
const HEADING_SMOOTHING_FACTOR = 0.28;
const MOVEMENT_HEADING_MIN_SPEED_MPS = 0.75;

function emit() {
  for (const cb of listeners) cb();
}

function normalizeHeading(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return ((value % 360) + 360) % 360;
}

function headingDeltaDegrees(from: number, to: number) {
  return ((to - from + 540) % 360) - 180;
}

function smoothHeading(nextHeading: number) {
  if (smoothedHeading === null) {
    smoothedHeading = nextHeading;
    return smoothedHeading;
  }

  const delta = headingDeltaDegrees(smoothedHeading, nextHeading);
  if (Math.abs(delta) < HEADING_JITTER_DEGREES) {
    return smoothedHeading;
  }

  smoothedHeading = normalizeHeading(smoothedHeading + delta * HEADING_SMOOTHING_FACTOR);
  return smoothedHeading;
}

function clearHeadingWhenStale() {
  headingStaleTimer = null;
  currentDeviceHeading = null;
  smoothedHeading = null;

  if (!currentLocation || currentLocation.heading === null) return;

  currentLocation = { ...currentLocation, heading: null };
  emit();
}

function scheduleHeadingStaleTimeout() {
  if (headingStaleTimer !== null) {
    clearTimeout(headingStaleTimer);
  }

  headingStaleTimer = setTimeout(clearHeadingWhenStale, DEVICE_HEADING_STALE_MS);
}

function updateHeadingFromReading(rawHeading: number | null) {
  const normalized = normalizeHeading(rawHeading);
  if (normalized === null) return currentDeviceHeading;

  const nextHeading = smoothHeading(normalized);
  if (nextHeading === null) return currentDeviceHeading;

  currentDeviceHeading = nextHeading;
  scheduleHeadingStaleTimeout();
  return currentDeviceHeading;
}

function getMovementHeading(coords: GeolocationCoordinates) {
  const speed = typeof coords.speed === "number" && Number.isFinite(coords.speed) ? coords.speed : 0;
  if (speed < MOVEMENT_HEADING_MIN_SPEED_MPS) return null;
  return normalizeHeading(coords.heading);
}

function resolveLocationHeading(coords: GeolocationCoordinates) {
  return currentDeviceHeading ?? updateHeadingFromReading(getMovementHeading(coords));
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
  const heading = updateHeadingFromReading(readDeviceHeading(event as DeviceOrientationEventWithCompass));
  if (heading === null) return;

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
