"use client";

import { useCallback } from "react";
import { Map, Compass, Search, Route } from "lucide-react";
import { useTransitStore } from "@/store/use-transit-store";
import { navigateTo, type Overlay } from "@/lib/navigation";

const tabs: { id: Overlay; label: string; icon: typeof Map }[] = [
  { id: null, label: "Map", icon: Map },
  { id: "nearby", label: "Nearby", icon: Compass },
  { id: "search", label: "Search", icon: Search },
  { id: "directions", label: "Directions", icon: Route },
];

export function BottomNavigation() {
  const activeOverlay = useTransitStore((s) => s.activeOverlay);
  const setShowPlanner = useTransitStore((s) => s.setShowPlanner);

  const handleTabChange = useCallback(
    (overlay: Overlay) => {
      navigateTo(overlay);
      if (overlay === "directions") setShowPlanner(true);
    },
    [setShowPlanner],
  );

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-1200 bg-white/95 backdrop-blur-lg border-t border-foreground/8 safe-bottom">
      <div className="h-16 flex items-stretch">
        {tabs.map(({ id, label, icon: IconComp }) => {
          const active =
            id === null
              ? activeOverlay === null
              : activeOverlay === id || (id === "directions" && activeOverlay === "route-detail");
          return (
            <button
              key={id ?? "map"}
              onClick={() => handleTabChange(id)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors active:scale-[0.96] ${
                active ? "text-primary" : "text-foreground/40"
              }`}
              style={{ minWidth: 56, minHeight: 56 }}
            >
              <IconComp size={24} strokeWidth={active ? 2.5 : 1.8} />
              <span
                className={`text-[10px] leading-tight font-semibold ${
                  active ? "text-primary" : "text-foreground/35"
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
