"use client";

import { useMemo } from "react";
import { Marker, Tooltip } from "react-leaflet";
import L from "leaflet";
import type { VehicleDto } from "@/lib/types";
import { TYPE_COLORS, TYPE_LABELS } from "@/lib/constants";
import { getBearingFromShape } from "@/lib/geo-utils";

interface VehicleMarkersProps {
  vehicles: VehicleDto[];
  focusedVehicleId: number | null;
  selectedVehicleId: number | null;
  shapes: Record<string, number[][]> | null;
  onVehicleClick: (id: number) => void;
}

function createChevronIcon(
  color: string,
  bearing: number,
  size: number
): L.DivIcon {
  const half = size / 2;
  // Navigation arrow SVG pointing up, rotated by bearing
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" style="transform:rotate(${bearing}deg); transform-origin: 12px 12px;">
    <path d="M12 2 L6 20 L12 15 L18 20 Z" fill="${color}" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`;

  return L.divIcon({
    html: svg,
    className: "leaflet-div-icon-vehicle",
    iconSize: [size, size],
    iconAnchor: [half, half],
  });
}

export function VehicleMarkers({
  vehicles,
  focusedVehicleId,
  selectedVehicleId,
  shapes,
  onVehicleClick,
}: VehicleMarkersProps) {
  const markers = useMemo(() => {
    return vehicles.map((v) => {
      const baseColor = TYPE_COLORS[v.transportType] || TYPE_COLORS.unknown;
      const isFocused =
        focusedVehicleId != null &&
        v.id === focusedVehicleId;
      const isSelected =
        selectedVehicleId != null &&
        v.id === selectedVehicleId;
      const isHighlighted = isFocused || isSelected;
      const isDimmed =
        selectedVehicleId != null && !isSelected && !isFocused;

      const color = isHighlighted ? "#FF9800" : baseColor;
      const size = isHighlighted ? 32 : 24;

      // Compute bearing from shape if available
      let bearing = v.heading;
      if (shapes && v.routeKey && shapes[v.routeKey]) {
        const shapeBearing = getBearingFromShape(
          shapes[v.routeKey],
          v.distanceAlongRoute
        );
        if (shapeBearing != null) bearing = shapeBearing;
      }

      const icon = createChevronIcon(color, bearing, size);

      return {
        vehicle: v,
        icon,
        opacity: isDimmed ? 0.4 : 1,
        zIndex: isHighlighted ? 1000 : 100,
      };
    });
  }, [vehicles, focusedVehicleId, selectedVehicleId, shapes]);

  return (
    <>
      {markers.map(({ vehicle: v, icon, opacity, zIndex }) => (
        <Marker
          key={v.id}
          position={[v.latitude, v.longitude]}
          icon={icon}
          opacity={opacity}
          zIndexOffset={zIndex}
          eventHandlers={{
            click: (e) => {
              L.DomEvent.stopPropagation(e.originalEvent);
              onVehicleClick(v.id);
            },
          }}
        >
          <Tooltip direction="top" offset={[0, -12]}>
            <span className="text-sm font-medium">
              {TYPE_LABELS[v.transportType] ?? v.transportType} {v.lineNumber}
            </span>
            <span className="text-xs text-muted-foreground ml-1">
              #{v.id}
            </span>
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}
