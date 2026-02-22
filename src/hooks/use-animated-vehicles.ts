"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { VehicleDto } from "@/lib/types";

const TRANSITION_MS = 1000;

interface VehicleTransition {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  startTime: number;
  fromBearing: number;
  toBearing: number;
}

export function useAnimatedVehicles(rawVehicles: VehicleDto[]): VehicleDto[] {
  const transitionsRef = useRef<Map<number, VehicleTransition>>(new Map());
  const prevPositionsRef = useRef<Map<number, { lat: number; lng: number; bearing: number }>>(
    new Map(),
  );
  const rawRef = useRef<VehicleDto[]>(rawVehicles);
  const frameIdRef = useRef<number | null>(null);
  const [animated, setAnimated] = useState<VehicleDto[]>([]);
  const isAnimatingRef = useRef(false);
  const vehiclesKeyRef = useRef<string>("");

  const startAnimationLoop = useCallback(() => {
    function animate() {
      const vehicles = rawRef.current;
      if (vehicles.length === 0) {
        frameIdRef.current = null;
        isAnimatingRef.current = false;
        return;
      }

      const transitions = transitionsRef.current;
      const prev = prevPositionsRef.current;
      const currentTime = Date.now();
      let anyActive = false;

      const result = vehicles.map((v) => {
        const t = transitions.get(v.id);
        if (!t) return v;

        const elapsed = currentTime - t.startTime;
        if (elapsed >= TRANSITION_MS) {
          prev.set(v.id, { lat: t.toLat, lng: t.toLng, bearing: t.toBearing });
          transitions.delete(v.id);
          return v;
        }

        anyActive = true;
        const progress = elapsed / TRANSITION_MS;
        const eased = 1 - Math.pow(1 - progress, 3);

        let interpolatedBearing = t.toBearing;
        if (t.fromBearing !== t.toBearing) {
          let bearingDiff = t.toBearing - t.fromBearing;
          if (bearingDiff > 180) bearingDiff -= 360;
          if (bearingDiff < -180) bearingDiff += 360;
          interpolatedBearing = (t.fromBearing + bearingDiff * eased + 360) % 360;
        }

        return {
          ...v,
          latitude: t.fromLat + (t.toLat - t.fromLat) * eased,
          longitude: t.fromLng + (t.toLng - t.fromLng) * eased,
          bearing: interpolatedBearing,
        };
      });

      setAnimated(result);

      if (!anyActive) {
        for (const v of vehicles) {
          prev.set(v.id, {
            lat: v.latitude,
            lng: v.longitude,
            bearing: v.bearing,
          });
        }
        frameIdRef.current = null;
        isAnimatingRef.current = false;
        return;
      }

      frameIdRef.current = requestAnimationFrame(animate);
    }

    frameIdRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    const key = rawVehicles.map((v) => `${v.id}:${v.latitude}:${v.longitude}`).join("|");
    if (key === vehiclesKeyRef.current) return;
    vehiclesKeyRef.current = key;

    const now = Date.now();
    const prev = prevPositionsRef.current;
    const transitions = transitionsRef.current;
    let hasNewTransitions = false;
    const activeIds = new Set(rawVehicles.map((v) => v.id));

    for (const id of Array.from(prev.keys())) {
      if (!activeIds.has(id)) prev.delete(id);
    }
    for (const id of Array.from(transitions.keys())) {
      if (!activeIds.has(id)) transitions.delete(id);
    }

    for (const v of rawVehicles) {
      const old = prev.get(v.id);
      if (old && (old.lat !== v.latitude || old.lng !== v.longitude)) {
        transitions.set(v.id, {
          fromLat: old.lat,
          fromLng: old.lng,
          toLat: v.latitude,
          toLng: v.longitude,
          startTime: now,
          fromBearing: old.bearing,
          toBearing: v.bearing,
        });
        hasNewTransitions = true;
      } else if (!old) {
        prev.set(v.id, {
          lat: v.latitude,
          lng: v.longitude,
          bearing: v.bearing,
        });
      }
    }

    rawRef.current = rawVehicles;

    if (hasNewTransitions && !isAnimatingRef.current) {
      isAnimatingRef.current = true;
      startAnimationLoop();
    }
  }, [rawVehicles, startAnimationLoop]);

  useEffect(() => {
    return () => {
      if (frameIdRef.current) {
        cancelAnimationFrame(frameIdRef.current);
      }
    };
  }, []);

  return useMemo(() => {
    if (animated.length === 0) return rawVehicles;
    const animatedById = new Map<number, VehicleDto>();
    for (const v of animated) {
      animatedById.set(v.id, v);
    }
    return rawVehicles.map((v) => animatedById.get(v.id) ?? v);
  }, [rawVehicles, animated]);
}
