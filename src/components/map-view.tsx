"use client";

import dynamic from "next/dynamic";
import type { MapViewInnerProps } from "./map-view-inner";

const MapViewInner = dynamic(
  () => import("./map-view-inner").then((mod) => mod.MapViewInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full w-full bg-background">
        <div className="text-muted-foreground">Loading map...</div>
      </div>
    ),
  },
);

export function MapView(props: MapViewInnerProps) {
  return <MapViewInner {...props} />;
}
