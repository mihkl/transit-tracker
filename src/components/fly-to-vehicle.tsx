"use client";

import { useEffect, useRef, useCallback } from "react";
import { useMap } from "react-leaflet";
import type { VehicleDto } from "@/lib/types";

interface FlyToVehicleProps {
  vehicles: VehicleDto[];
  focusedVehicleId: number | null;
  selectedVehicleId: number | null;
}

/**
 * Offset the target so the vehicle appears in the upper portion of the
 * visible map area. On mobile the bottom sheet covers the lower part,
 * so we shift the map center south by a fraction of the viewport height.
 */
function getOffsetCenter(
  map: L.Map,
  lat: number,
  lng: number,
  zoom: number
): [number, number] {
  const containerHeight = map.getSize().y;
  const isMobile = map.getSize().x < 768;

  if (!isMobile) return [lat, lng];

  // Shift the center down by ~30% of the viewport so the vehicle
  // appears in the upper third (above the bottom sheet)
  const offsetPx = containerHeight * 0.25;
  const point = map.project([lat, lng], zoom);
  point.y -= offsetPx;
  const offset = map.unproject(point, zoom);
  return [offset.lat, offset.lng];
}

export function FlyToVehicle({
  vehicles,
  focusedVehicleId,
  selectedVehicleId,
}: FlyToVehicleProps) {
  const map = useMap();
  const vehiclesRef = useRef(vehicles);
  vehiclesRef.current = vehicles;
  const followingRef = useRef(false);

  const flyToWithOffset = useCallback(
    (lat: number, lng: number) => {
      const zoom = 14;
      const center = getOffsetCenter(map, lat, lng, zoom);
      map.flyTo(center, zoom, { duration: 0.8 });
    },
    [map]
  );

  const panToWithOffset = useCallback(
    (lat: number, lng: number) => {
      const zoom = map.getZoom();
      const center = getOffsetCenter(map, lat, lng, zoom);
      map.panTo(center, { animate: true, duration: 1 });
    },
    [map]
  );

  // Fly to vehicle when focusedVehicleId changes (one-time fly)
  useEffect(() => {
    if (!focusedVehicleId) return;

    const v = vehiclesRef.current.find(
      (v) => v.id === focusedVehicleId
    );
    if (v) {
      flyToWithOffset(v.latitude, v.longitude);
      followingRef.current = true;
    }
  }, [focusedVehicleId, flyToWithOffset]);

  // Stop following when user manually interacts with the map
  useEffect(() => {
    const onDragStart = () => {
      followingRef.current = false;
    };
    map.on("dragstart", onDragStart);
    return () => {
      map.off("dragstart", onDragStart);
    };
  }, [map]);

  // Follow the selected vehicle as it moves
  useEffect(() => {
    if (!selectedVehicleId || !followingRef.current) return;

    const v = vehicles.find((v) => v.id === selectedVehicleId);
    if (v) {
      panToWithOffset(v.latitude, v.longitude);
    }
  }, [vehicles, selectedVehicleId, panToWithOffset]);

  // Reset following state when vehicle is deselected
  useEffect(() => {
    if (!selectedVehicleId) {
      followingRef.current = false;
    }
  }, [selectedVehicleId]);

  return null;
}
