"use client";

import { useState, useEffect, useRef } from "react";
import type { VehicleDto } from "@/lib/types";

const TRANSITION_MS = 1000; // smooth move duration
const FRAME_INTERVAL = 50; // ~20fps

type ShapesMap = Record<string, number[][]>;

interface VehicleTransition {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  startTime: number;
}

export function useAnimatedVehicles(
  rawVehicles: VehicleDto[],
  _shapes: ShapesMap | null
): VehicleDto[] {
  const transitionsRef = useRef<Map<number, VehicleTransition>>(new Map());
  const prevPositionsRef = useRef<Map<number, { lat: number; lng: number }>>(
    new Map()
  );
  const rawRef = useRef<VehicleDto[]>(rawVehicles);
  const [animated, setAnimated] = useState<VehicleDto[]>([]);

  // When new data arrives, set up transitions from previous to new positions
  useEffect(() => {
    const now = Date.now();
    const prev = prevPositionsRef.current;
    const transitions = transitionsRef.current;

    for (const v of rawVehicles) {
      const old = prev.get(v.id);
      if (old && (old.lat !== v.latitude || old.lng !== v.longitude)) {
        transitions.set(v.id, {
          fromLat: old.lat,
          fromLng: old.lng,
          toLat: v.latitude,
          toLng: v.longitude,
          startTime: now,
        });
      } else if (!old) {
        // First time seeing this vehicle, no transition needed
        prev.set(v.id, { lat: v.latitude, lng: v.longitude });
      }
    }

    rawRef.current = rawVehicles;
  }, [rawVehicles]);

  // Animation loop: lerp positions during transitions
  useEffect(() => {
    let frameId: number;
    let lastRender = 0;

    function animate(now: number) {
      frameId = requestAnimationFrame(animate);

      if (now - lastRender < FRAME_INTERVAL) return;
      lastRender = now;

      const vehicles = rawRef.current;
      if (vehicles.length === 0) return;

      const transitions = transitionsRef.current;
      const prev = prevPositionsRef.current;
      const currentTime = Date.now();
      let anyActive = false;

      const result = vehicles.map((v) => {
        const t = transitions.get(v.id);
        if (!t) return v;

        const elapsed = currentTime - t.startTime;
        if (elapsed >= TRANSITION_MS) {
          // Transition complete
          prev.set(v.id, { lat: t.toLat, lng: t.toLng });
          transitions.delete(v.id);
          return v;
        }

        anyActive = true;
        // Ease-out cubic for smooth deceleration
        const progress = elapsed / TRANSITION_MS;
        const eased = 1 - Math.pow(1 - progress, 3);

        return {
          ...v,
          latitude: t.fromLat + (t.toLat - t.fromLat) * eased,
          longitude: t.fromLng + (t.toLng - t.fromLng) * eased,
        };
      });

      setAnimated(result);

      // Clean up finished transitions and update prev positions
      if (!anyActive) {
        for (const v of vehicles) {
          prev.set(v.id, { lat: v.latitude, lng: v.longitude });
        }
      }
    }

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return animated.length > 0 ? animated : rawVehicles;
}
