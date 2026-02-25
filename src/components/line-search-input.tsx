"use client";

import { Bus, TramFront, TrainFront, Zap } from "lucide-react";
import { TYPE_COLORS } from "@/lib/constants";

export function TypeIcon({ type, className }: { type: string; className?: string }) {
  const color = TYPE_COLORS[type] ?? TYPE_COLORS.unknown;
  const props = { size: 16, className, style: { color } };
  switch (type) {
    case "tram":
      return <TramFront {...props} />;
    case "trolleybus":
      return <Zap {...props} />;
    case "bus":
      return <Bus {...props} />;
    case "train":
      return <TrainFront {...props} />;
    default:
      return <Bus {...props} />;
  }
}
