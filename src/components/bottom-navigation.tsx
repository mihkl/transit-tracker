"use client";

import { Map, Compass, Search, Route, Layers } from "lucide-react";
import { useTransitStore, type MobileTab } from "@/store/use-transit-store";

const tabs: { id: MobileTab; label: string; icon: typeof Map }[] = [
  { id: "map", label: "Map", icon: Map },
  { id: "nearby", label: "Nearby", icon: Compass },
  { id: "search", label: "Search", icon: Search },
  { id: "directions", label: "Directions", icon: Route },
  { id: "layers", label: "Layers", icon: Layers },
];

export function BottomNavigation() {
  const mobileTab = useTransitStore((s) => s.mobileTab);
  const showMobileLayers = useTransitStore((s) => s.showMobileLayers);
  const handleMobileTabChange = useTransitStore((s) => s.handleMobileTabChange);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[1200] bg-white/95 backdrop-blur-lg border-t border-foreground/8 safe-bottom">
      <div className="h-16 flex items-stretch">
        {tabs.map(({ id, label, icon: IconComp }) => {
          const active = id === "layers" ? showMobileLayers : mobileTab === id;
          return (
            <button
              key={id}
              onClick={() => handleMobileTabChange(id)}
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
