"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { formatCoord } from "@/lib/format-utils";
import type { PlaceSearchResult } from "@/lib/types";

interface PlaceSearchInputProps {
  label: string;
  dotColor: string;
  value: { lat: number; lng: number; name?: string } | null;
  onSelect: (place: { lat: number; lng: number; name: string }) => void;
  pickingPoint: "origin" | "destination" | null;
  pointType: "origin" | "destination";
  onStartPicking: (point: "origin" | "destination" | null) => void;
}

export function PlaceSearchInput({
  label,
  dotColor,
  value,
  onSelect,
  pickingPoint,
  pointType,
  onStartPicking,
}: PlaceSearchInputProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value && "name" in value && value.name) {
      setQuery(value.name);
    } else if (value) {
      setQuery(formatCoord(value.lat, value.lng));
    }
  }, [value]);

  const searchPlaces = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/places/search?q=${encodeURIComponent(q)}`
      );
      const data = await res.json();
      setResults(data.results || []);
      setShowDropdown(true);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchPlaces(val), 400);
  };

  const handleSelect = (place: PlaceSearchResult) => {
    setQuery(place.name || place.address);
    setShowDropdown(false);
    setResults([]);
    onSelect({
      lat: place.lat,
      lng: place.lng,
      name: place.name || place.address,
    });
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const isPicking = pickingPoint === pointType;

  return (
    <div className="flex items-center gap-2" ref={wrapperRef}>
      <div
        className="w-3 h-3 rounded-full shrink-0"
        style={{ backgroundColor: dotColor }}
      />
      <div className="relative flex-1">
        <Input
          className="h-8 text-sm"
          type="text"
          placeholder={`Search ${label}...`}
          value={query}
          onChange={handleInput}
          onFocus={() => {
            if (results.length > 0) setShowDropdown(true);
          }}
        />
        {loading && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div className="w-3 h-3 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {showDropdown && results.length > 0 && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1">
            <Command className="border border-border rounded-md shadow-lg">
              <CommandList>
                <CommandEmpty>No results.</CommandEmpty>
                <CommandGroup>
                  {results.map((place, i) => (
                    <CommandItem
                      key={i}
                      onSelect={() => handleSelect(place)}
                      className="cursor-pointer"
                    >
                      <div>
                        <div className="text-sm font-medium">{place.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {place.address}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>
        )}
      </div>
      <Button
        variant={isPicking ? "secondary" : "outline"}
        size="sm"
        className="h-8 shrink-0 text-xs"
        onClick={() => onStartPicking(isPicking ? null : pointType)}
      >
        {isPicking ? "Picking..." : "Map"}
      </Button>
    </div>
  );
}
