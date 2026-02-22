"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useClickOutside } from "@/hooks/use-click-outside";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { AlertCircle, Crosshair, MapPin, Navigation } from "lucide-react";
import { formatCoord } from "@/lib/format-utils";
import type { PlaceSearchResult } from "@/lib/types";
import { searchPlacesAction } from "@/actions";

interface PlaceSearchInputProps {
  value: { lat: number; lng: number; name?: string } | null;
  onSelect: (place: { lat: number; lng: number; name: string }) => void;
  pickingPoint: "origin" | "destination" | null;
  pointType: "origin" | "destination";
  onStartPicking: (point: "origin" | "destination" | null) => void;
  currentLocation?: { lat: number; lng: number } | null;
}

export function PlaceSearchInput({
  value,
  onSelect,
  pickingPoint,
  pointType,
  onStartPicking,
  currentLocation,
}: PlaceSearchInputProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
      setErrorMessage(null);
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const results = await searchPlacesAction(q);
      setResults(results);
      setShowDropdown(true);
    } catch (err) {
      console.error("Search failed:", err);
      setErrorMessage("Search failed. Check connection and try again.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (errorMessage) setErrorMessage(null);
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
    if (!currentLocation) return;
    setQuery("Your location");
    setShowDropdown(false);
    setResults([]);
    setErrorMessage(null);
    onSelect({
      lat: currentLocation.lat,
      lng: currentLocation.lng,
      name: "Your location",
    });
  }, [currentLocation, onSelect]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const closeDropdown = useCallback(() => setShowDropdown(false), []);
  useClickOutside(wrapperRef, closeDropdown);

  const isPicking = pickingPoint === pointType;
  const isOrigin = pointType === "origin";
  const canUseMyLocation = isOrigin && !!currentLocation;

  return (
    <div className="relative" ref={wrapperRef}>
      <div
        className={`relative flex items-center h-10 rounded-xl border transition-all duration-150 ${
          isPicking
            ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
            : "border-foreground/10 bg-foreground/[0.03] focus-within:border-foreground/20 focus-within:bg-white focus-within:shadow-sm"
        }`}
      >
        <input
          ref={inputRef}
          className="w-full h-full pl-3 pr-16 text-sm bg-transparent rounded-xl outline-none placeholder:text-foreground/50 text-foreground/85 font-medium"
          type="text"
          placeholder={isOrigin ? "From" : "To"}
          value={query}
          onChange={handleInput}
          onFocus={() => setShowDropdown(true)}
        />

        {/* Loading spinner */}
        {loading && (
          <div className="absolute right-10 top-1/2 -translate-y-1/2">
            <div className="w-3.5 h-3.5 border-2 border-foreground/10 border-t-foreground/50 rounded-full animate-spin" />
          </div>
        )}

        {/* Map picker button — icon only */}
        <button
          onClick={() => onStartPicking(isPicking ? null : pointType)}
          className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
            isPicking
              ? "bg-primary text-white"
              : "text-foreground/45 hover:text-foreground/70 hover:bg-foreground/[0.06]"
          }`}
          title={isPicking ? "Cancel picking" : "Pick on map"}
        >
          <Navigation size={14} />
        </button>
      </div>

      {showDropdown && (
        <div className="absolute z-50 top-full left-0 right-0 md:w-80 mt-1.5 animate-scale-in">
          <Command className="bg-white border border-foreground/8 rounded-xl shadow-dropdown">
            <CommandList>
              {errorMessage && (
                <div className="mx-2 mt-2 mb-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-amber-800">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <span className="text-xs font-medium">{errorMessage}</span>
                  </div>
                </div>
              )}
              <CommandEmpty className="py-4 text-center text-sm text-foreground/50">
                No results.
              </CommandEmpty>
              {canUseMyLocation && (
                <CommandGroup>
                  <CommandItem
                    onSelect={handleUseMyLocation}
                    className="cursor-pointer px-3 py-2.5 hover:bg-blue-50 rounded-lg mx-1 transition-colors"
                  >
                    <Crosshair size={15} className="mr-2.5 text-blue-500 shrink-0" />
                    <span className="text-sm font-semibold text-blue-600">Use my location</span>
                  </CommandItem>
                </CommandGroup>
              )}
              {results.length > 0 && (
                <CommandGroup>
                  {results.map((place, i) => (
                    <CommandItem
                      key={i}
                      onSelect={() => handleSelect(place)}
                      className="cursor-pointer px-3 py-2.5 hover:bg-foreground/[0.04] rounded-lg mx-1 transition-colors"
                    >
                      <MapPin size={15} className="mr-2.5 text-foreground/40 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground/85 truncate">
                          {place.name}
                        </div>
                        <div className="text-xs text-foreground/50 truncate">{place.address}</div>
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
