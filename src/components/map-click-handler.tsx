"use client";

import { useRef } from "react";
import { useMapEvents } from "react-leaflet";

interface MapClickHandlerProps {
  pickingPoint: "origin" | "destination" | null;
  onMapClick: (pointType: string, lat: number, lng: number) => void;
  onDeselectVehicle?: () => void;
}

export function MapClickHandler({
  pickingPoint,
  onMapClick,
  onDeselectVehicle,
}: MapClickHandlerProps) {
  const pickingRef = useRef(pickingPoint);
  pickingRef.current = pickingPoint;
  const callbackRef = useRef(onMapClick);
  callbackRef.current = onMapClick;
  const deselectRef = useRef(onDeselectVehicle);
  deselectRef.current = onDeselectVehicle;

  useMapEvents({
    click(e) {
      if (pickingRef.current) {
        callbackRef.current(pickingRef.current, e.latlng.lat, e.latlng.lng);
      } else {
        // Background click — deselect vehicle
        deselectRef.current?.();
      }
    },
  });

  return null;
}
