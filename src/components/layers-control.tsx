"use client";

import { Bus, Car, MapPin, X } from "lucide-react";
import { TYPE_COLORS } from "@/lib/constants";

/* ── Toggle switch row ─────────────────────────────────── */

function ToggleRow({
  label,
  description,
  enabled,
  onChange,
  icon: Icon,
}: {
  label: string;
  description?: string;
  enabled: boolean;
  onChange: () => void;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      onClick={onChange}
      className="w-full flex items-center gap-4 p-4 rounded-2xl border border-foreground/8 transition-colors active:scale-[0.98]"
    >
      <div className="w-12 h-12 rounded-xl bg-foreground/[0.04] flex items-center justify-center shrink-0">
        <Icon className="w-6 h-6 text-foreground/70" />
      </div>
      <div className="flex-1 text-left min-w-0">
        <div className="text-[16px] font-bold text-foreground/90">{label}</div>
        {description && (
          <div className="text-[14px] text-foreground/50 mt-0.5">{description}</div>
        )}
      </div>
      {/* Switch track */}
      <div
        className={`w-[60px] h-[32px] rounded-full p-[3px] transition-colors duration-200 shrink-0 ${
          enabled ? "bg-primary" : "bg-foreground/15"
        }`}
      >
        <div
          className={`w-[26px] h-[26px] rounded-full bg-white shadow-sm transition-transform duration-200 ${
            enabled ? "translate-x-[28px]" : "translate-x-0"
          }`}
        />
      </div>
    </button>
  );
}

/* ── Main component ────────────────────────────────────── */

interface LayersControlProps {
  showVehicles: boolean;
  onToggleVehicles: () => void;
  showTraffic: boolean;
  onToggleTraffic: () => void;
  showStops: boolean;
  onToggleStops: () => void;
  selectedLine: { lineNumber: string; type: string } | null;
  onLineSelect: (line: { lineNumber: string; type: string } | null) => void;
  onClose: () => void;
}

const TRANSPORT_TYPES = [
  { type: "bus", label: "Bus" },
  { type: "tram", label: "Tram" },
  { type: "trolleybus", label: "Trolley" },
  { type: "train", label: "Train" },
] as const;

export function LayersControl({
  showVehicles,
  onToggleVehicles,
  showTraffic,
  onToggleTraffic,
  showStops,
  onToggleStops,
  selectedLine,
  onLineSelect,
  onClose,
}: LayersControlProps) {
  const activeType = selectedLine?.type ?? null;

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-foreground/6 shrink-0">
        <h2 className="text-lg font-bold text-foreground/90">Map Layers</h2>
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-foreground/5 transition-colors"
        >
          <X className="w-5 h-5 text-foreground/60" />
        </button>
      </div>

      {/* Toggles */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-20 space-y-3">
        <ToggleRow
          label="Live Vehicles"
          description="Real-time vehicle positions"
          enabled={showVehicles}
          onChange={onToggleVehicles}
          icon={Bus}
        />
        <ToggleRow
          label="Traffic"
          description="Traffic flow overlay"
          enabled={showTraffic}
          onChange={onToggleTraffic}
          icon={Car}
        />
        <ToggleRow
          label="All Stops"
          description="Show all transit stops"
          enabled={showStops}
          onChange={onToggleStops}
          icon={MapPin}
        />

        {/* Transport type chips (visible when vehicles are on) */}
        {showVehicles && (
          <div className="pt-4">
            <h3 className="text-[13px] font-bold text-foreground/45 uppercase tracking-wider mb-3">
              Filter by type
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onLineSelect(null)}
                className={`h-12 px-5 rounded-xl text-[15px] font-bold transition-all duration-150 active:scale-[0.97] ${
                  !activeType
                    ? "bg-foreground text-white"
                    : "bg-foreground/[0.06] text-foreground/60"
                }`}
              >
                All
              </button>
              {TRANSPORT_TYPES.map(({ type, label }) => {
                const color = TYPE_COLORS[type] || "#999";
                const isActive = activeType === type;
                return (
                  <button
                    key={type}
                    onClick={() =>
                      onLineSelect(
                        isActive ? null : { lineNumber: "", type },
                      )
                    }
                    className="h-12 px-5 rounded-xl text-[15px] font-bold transition-all duration-150 active:scale-[0.97] border-2"
                    style={{
                      backgroundColor: isActive ? color : "transparent",
                      color: isActive ? "white" : color,
                      borderColor: isActive ? color : `${color}30`,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
