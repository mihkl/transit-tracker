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
  const [gettingLocation, setGettingLocation] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      const res = await fetch(`/api/places/search?q=${encodeURIComponent(q)}`);
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

  const handleUseMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setQuery("Your location");
        setShowDropdown(false);
        setResults([]);
        onSelect({
          lat: latitude,
          lng: longitude,
          name: "Your location",
        });
        setGettingLocation(false);
      },
      (error) => {
        console.error("Geolocation error:", error);
        alert(
          "Unable to get your location. Please enable location permissions.",
        );
        setGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [onSelect]);

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
  const isOrigin = pointType === "origin";

  return (
    <div className="flex items-center gap-2" ref={wrapperRef}>
      <div
        className="w-3 h-3 rounded-full shrink-0"
        style={{ backgroundColor: dotColor }}
      />
      <div className="relative flex-1">
        <Input
          ref={inputRef}
          className="h-8 text-sm bg-gray-50 border-0 focus:bg-white focus:ring-1 focus:ring-gray-200"
          type="text"
          placeholder={isOrigin ? "Your location" : `Search ${label}...`}
          value={query}
          onChange={handleInput}
          onFocus={() => {
            setShowDropdown(true);
          }}
        />
        {(loading || gettingLocation) && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div className="w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {showDropdown && (
          <div className="absolute z-50 top-full left-0 w-80 mt-1">
            <Command className="bg-white border border-gray-100 rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.1)]">
              <CommandList>
                <CommandEmpty>No results.</CommandEmpty>
                {isOrigin && (
                  <CommandGroup>
                    <CommandItem
                      onSelect={handleUseMyLocation}
                      className="cursor-pointer px-3 py-2 hover:bg-gray-50 rounded-md mx-1"
                    >
                      <svg
                        className="w-4 h-4 mr-2 text-blue-500"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle cx="12" cy="12" r="3" />
                        <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
                      </svg>
                      <span className="text-sm font-medium text-blue-600">
                        Your location
                      </span>
                    </CommandItem>
                  </CommandGroup>
                )}
                {results.length > 0 && (
                  <CommandGroup>
                    {results.map((place, i) => (
                      <CommandItem
                        key={i}
                        onSelect={() => handleSelect(place)}
                        className="cursor-pointer px-3 py-2 hover:bg-gray-50 rounded-md mx-1"
                      >
                        <svg
                          className="w-4 h-4 mr-2 text-gray-400 shrink-0"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                          <circle cx="12" cy="9" r="2.5" />
                        </svg>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-800 truncate">
                            {place.name}
                          </div>
                          <div className="text-xs text-gray-400 truncate">
                            {place.address}
                          </div>
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
      <Button
        variant={isPicking ? "secondary" : "outline"}
        size="sm"
        className="h-8 shrink-0 text-xs bg-gray-100 border-0 hover:bg-gray-200 text-gray-600"
        onClick={() => onStartPicking(isPicking ? null : pointType)}
      >
        {isPicking ? "Picking..." : "Map"}
      </Button>
    </div>
  );
}
