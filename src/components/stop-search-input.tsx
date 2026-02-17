"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useClickOutside } from "@/hooks/use-click-outside";
import { MapPin } from "lucide-react";
import { Icon } from "@/components/icon";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { StopDto } from "@/lib/types";

interface StopSearchInputProps {
  value: StopDto | null;
  onSelect: (stop: StopDto | null) => void;
}

const STOP_TYPE_COLORS: Record<string, string> = {
  B: "#2196F3",
  T: "#F44336",
  t: "#4CAF50",
  K: "#FF9800",
};

export function StopSearchInput({ value, onSelect }: StopSearchInputProps) {
  const [query, setQuery] = useState(() => (value ? value.stopName : ""));
  const [stops, setStops] = useState<StopDto[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/all-stops")
      .then((r) => r.json())
      .then((data: StopDto[]) => setStops(data))
      .catch((err) => console.error("Failed to load stops:", err));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return stops
      .filter((s) => s.stopName.toLowerCase().includes(q))
      .slice(0, 20);
  }, [stops, query]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setShowDropdown(val.trim().length > 0);
    if (val.trim() === "") {
      onSelect(null);
    }
  };

  const handleSelect = (stop: StopDto) => {
    setQuery(stop.stopName);
    setShowDropdown(false);
    onSelect(stop);
  };

  const handleClear = () => {
    setQuery("");
    setShowDropdown(false);
    onSelect(null);
  };

  const closeDropdown = useCallback(() => setShowDropdown(false), []);
  useClickOutside(wrapperRef, closeDropdown);

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="relative flex items-center">
        <MapPin
          className="absolute left-2.5 w-3.5 h-3.5 text-gray-400 pointer-events-none"
          size={14}
        />
        <Input
          className="w-full h-9 pl-8 pr-7 text-sm bg-gray-50 border-0 focus:bg-white focus:ring-1 focus:ring-gray-200 min-w-0"
          type="text"
          placeholder="Stop"
          value={query}
          onChange={handleInput}
          onFocus={() => query.trim().length > 0 && setShowDropdown(true)}
        />
        {value && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Icon name="x-close" size={14} />
          </button>
        )}
      </div>
      {showDropdown && (
        <div className="fixed left-3 right-3 top-16 z-[1100] md:absolute md:top-full md:left-0 md:right-auto md:mt-1.5 md:w-72">
          <Command
            className="bg-white border border-gray-100 rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.1)]"
            shouldFilter={false}
          >
            <CommandList>
              <CommandEmpty>No matching stops.</CommandEmpty>
              {filtered.length > 0 && (
                <CommandGroup heading="Stops">
                  {filtered.map((stop) => (
                    <CommandItem
                      key={stop.stopId}
                      onSelect={() => handleSelect(stop)}
                      className="cursor-pointer py-2 px-3 hover:bg-gray-50 rounded-md mx-1"
                    >
                      <MapPin
                        size={14}
                        className="shrink-0 mr-2 text-gray-400 mt-0.5"
                      />
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span className="text-sm truncate">
                            {stop.stopName}
                          </span>
                          {stop.stopArea && stop.stopArea !== "Kesklinn" && (
                            <span className="text-xs text-gray-400">
                              ({stop.stopArea})
                            </span>
                          )}
                        </div>
                        {stop.stopDesc && (
                          <span className="text-xs text-gray-400 truncate mt-0.5">
                            {stop.stopDesc}
                          </span>
                        )}
                        {stop.lines && stop.lines.length > 0 && (
                          <div className="flex flex-wrap gap-0.5 mt-1">
                            {stop.lines.slice(0, 8).map((line) => {
                              const typeCode = line[0];
                              const lineNum = line.slice(2);
                              const color =
                                STOP_TYPE_COLORS[typeCode] || "#666";
                              return (
                                <span
                                  key={line}
                                  className="text-[9px] px-1 rounded text-white font-medium"
                                  style={{ backgroundColor: color }}
                                >
                                  {lineNum}
                                </span>
                              );
                            })}
                            {stop.lines.length > 8 && (
                              <span className="text-[9px] text-gray-400">
                                +{stop.lines.length - 8}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  );
}
