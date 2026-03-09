"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { useClickOutside } from "@/hooks/use-click-outside";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { AlertCircle, Bookmark, Crosshair, MapPin, Navigation } from "lucide-react";
import { formatCoord } from "@/lib/format-utils";
import type { PlaceSearchResult } from "@/lib/types";
import { searchPlacesActionAsync } from "@/actions";
import { getBrowserClientId } from "@/lib/browser-client-id";

interface SavedLocation {
  lat: number;
  lng: number;
  name: string;
  nickname?: string;
}

interface PlaceSearchInputProps {
  value: { lat: number; lng: number; name?: string } | null;
  onSelect: (place: { lat: number; lng: number; name: string }) => void;
  pickingPoint: string | null;
  pointId: string;
  onStartPicking: (point: string | null) => void;
  placeholder: string;
  currentLocation?: { lat: number; lng: number } | null;
  savedLocations?: SavedLocation[];
  onSaveLocation?: (point: { lat: number; lng: number; name: string }, nickname?: string) => void;
  isLocationSaved?: (lat: number, lng: number) => boolean;
  allowCurrentLocation?: boolean;
}

interface PlaceSearchState {
  query: string;
  results: PlaceSearchResult[];
  showDropdown: boolean;
  loading: boolean;
  errorMessage: string | null;
  showSavePopover: boolean;
  nicknameInput: string;
}

const INITIAL_STATE: PlaceSearchState = {
  query: "",
  results: [],
  showDropdown: false,
  loading: false,
  errorMessage: null,
  showSavePopover: false,
  nicknameInput: "",
};

type PlaceSearchAction =
  | { type: "syncQuery"; query: string }
  | { type: "openDropdown" }
  | { type: "closeOverlays" }
  | { type: "setQuery"; query: string }
  | { type: "clearSearch" }
  | { type: "startSearch" }
  | { type: "finishSearch"; results: PlaceSearchResult[]; errorMessage: string | null }
  | { type: "selectPlace"; query: string }
  | { type: "openSavePopover"; nicknameInput: string }
  | { type: "closeSavePopover" }
  | { type: "setNicknameInput"; nicknameInput: string };

function placeSearchReducer(state: PlaceSearchState, action: PlaceSearchAction): PlaceSearchState {
  switch (action.type) {
    case "syncQuery":
      return { ...state, query: action.query };
    case "openDropdown":
      return { ...state, showDropdown: true, showSavePopover: false };
    case "closeOverlays":
      return { ...state, showDropdown: false, showSavePopover: false };
    case "setQuery":
      return { ...state, query: action.query, errorMessage: null, showDropdown: true };
    case "clearSearch":
      return { ...state, loading: false, results: [], errorMessage: null };
    case "startSearch":
      return { ...state, loading: true, errorMessage: null, showDropdown: true };
    case "finishSearch":
      return {
        ...state,
        loading: false,
        results: action.results,
        errorMessage: action.errorMessage,
        showDropdown: true,
      };
    case "selectPlace":
      return {
        ...state,
        query: action.query,
        results: [],
        errorMessage: null,
        showDropdown: false,
        showSavePopover: false,
      };
    case "openSavePopover":
      return {
        ...state,
        nicknameInput: action.nicknameInput,
        showDropdown: false,
        showSavePopover: true,
      };
    case "closeSavePopover":
      return { ...state, showSavePopover: false };
    case "setNicknameInput":
      return { ...state, nicknameInput: action.nicknameInput };
    default:
      return state;
  }
}

function getPlaceResultKey(place: PlaceSearchResult) {
  return `${place.lat}:${place.lng}:${place.name}:${place.address}`;
}

function SavePlacePopover({
  value,
  nicknameInput,
  inputRef,
  onChangeNickname,
  onCancel,
  onSave,
}: {
  value: { lat: number; lng: number; name?: string };
  nicknameInput: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChangeNickname: (nickname: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="absolute z-50 top-full left-0 right-0 md:w-80 mt-1.5 animate-scale-in">
      <div className="bg-white border border-foreground/8 rounded-xl shadow-dropdown p-3">
        <div className="text-[11px] uppercase tracking-wider text-foreground/40 font-semibold mb-2">
          Save place
        </div>
        <input
          ref={inputRef}
          className="w-full h-9 px-3 text-sm bg-foreground/[0.03] border border-foreground/10 rounded-lg outline-none focus:border-foreground/20 font-medium text-foreground/85"
          placeholder="Nickname (optional)"
          value={nicknameInput}
          onChange={(event) => onChangeNickname(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSave();
            if (event.key === "Escape") onCancel();
          }}
        />
        <div className="text-[11px] text-foreground/40 mt-1.5 truncate px-0.5">
          {value.name}
        </div>
        <div className="flex gap-2 mt-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 h-8 rounded-lg text-[12px] font-semibold text-foreground/50 hover:bg-foreground/[0.04] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            className="flex-1 h-8 rounded-lg bg-primary text-white text-[12px] font-semibold hover:bg-primary/90 active:scale-[0.97] transition-all"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function SearchResultsDropdown({
  errorMessage,
  canUseMyLocation,
  results,
  savedLocations,
  onUseMyLocation,
  onSelectSavedLocation,
  onSelectResult,
}: {
  errorMessage: string | null;
  canUseMyLocation: boolean;
  results: PlaceSearchResult[];
  savedLocations?: SavedLocation[];
  onUseMyLocation: () => void;
  onSelectSavedLocation: (location: SavedLocation) => void;
  onSelectResult: (place: PlaceSearchResult) => void;
}) {
  return (
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
                onSelect={onUseMyLocation}
                className="cursor-pointer px-3 py-2.5 hover:bg-blue-50 rounded-lg mx-1 transition-colors"
              >
                <Crosshair size={15} className="mr-2.5 text-blue-500 shrink-0" />
                <span className="text-sm font-semibold text-blue-600">Use my location</span>
              </CommandItem>
            </CommandGroup>
          )}
          {results.length === 0 && savedLocations && savedLocations.length > 0 && (
            <CommandGroup heading="Saved places">
              {savedLocations.map((loc) => (
                <CommandItem
                  key={`saved-${loc.lat}-${loc.lng}-${loc.nickname ?? loc.name}`}
                  onSelect={() => onSelectSavedLocation(loc)}
                  className="cursor-pointer px-3 py-2.5 hover:bg-foreground/[0.04] rounded-lg mx-1 transition-colors"
                >
                  <Bookmark size={14} className="mr-2.5 text-primary/50 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground/80 truncate">
                      {loc.nickname || loc.name}
                    </div>
                    {loc.nickname && (
                      <div className="text-[11px] text-foreground/40 truncate">
                        {loc.name}
                      </div>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results.length > 0 && (
            <CommandGroup>
              {results.map((place) => (
                <CommandItem
                  key={getPlaceResultKey(place)}
                  onSelect={() => onSelectResult(place)}
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
  );
}

export function PlaceSearchInput({
  value,
  onSelect,
  pickingPoint,
  pointId,
  onStartPicking,
  placeholder,
  currentLocation,
  savedLocations,
  onSaveLocation,
  isLocationSaved,
  allowCurrentLocation = false,
}: PlaceSearchInputProps) {
  const [state, dispatch] = useReducer(placeSearchReducer, INITIAL_STATE);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const nicknameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const query =
      value && "name" in value && value.name
        ? value.name
        : value
          ? formatCoord(value.lat, value.lng)
          : "";
    dispatch({ type: "syncQuery", query });
  }, [value]);

  useEffect(() => {
    if (state.showSavePopover) {
      nicknameInputRef.current?.focus();
    }
  }, [state.showSavePopover]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const searchPlaces = useCallback(async (query: string) => {
    if (query.length < 2) {
      dispatch({ type: "clearSearch" });
      return;
    }

    dispatch({ type: "startSearch" });
    const result = await searchPlacesActionAsync(query, getBrowserClientId() ?? undefined);
    dispatch({
      type: "finishSearch",
      results: result.results,
      errorMessage: result.error,
    });
  }, []);

  const closeOverlays = useCallback(() => {
    dispatch({ type: "closeOverlays" });
  }, []);

  useClickOutside(wrapperRef, closeOverlays);

  const handleInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const query = event.target.value;
    dispatch({ type: "setQuery", query });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void searchPlaces(query);
    }, 400);
  };

  const handleSelect = useCallback(
    (place: PlaceSearchResult) => {
      const query = place.name || place.address;
      dispatch({ type: "selectPlace", query });
      onSelect({
        lat: place.lat,
        lng: place.lng,
        name: query,
      });
    },
    [onSelect],
  );

  const handleUseMyLocation = useCallback(() => {
    if (!currentLocation) return;
    dispatch({ type: "selectPlace", query: "Your location" });
    onSelect({
      lat: currentLocation.lat,
      lng: currentLocation.lng,
      name: "Your location",
    });
  }, [currentLocation, onSelect]);

  const handleSave = useCallback(() => {
    if (!value || !onSaveLocation) return;
    const name = value.name || formatCoord(value.lat, value.lng);
    const nickname = state.nicknameInput.trim();
    onSaveLocation(
      { lat: value.lat, lng: value.lng, name },
      nickname && nickname !== name ? nickname : undefined,
    );
    dispatch({ type: "closeSavePopover" });
  }, [onSaveLocation, state.nicknameInput, value]);

  const isPicking = pickingPoint === pointId;
  const canUseMyLocation = allowCurrentLocation && !!currentLocation;
  const alreadySaved = value ? isLocationSaved?.(value.lat, value.lng) : false;
  const showBookmark = !!value && !!onSaveLocation;

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
          className={`w-full h-full pl-3 text-sm bg-transparent rounded-xl outline-none placeholder:text-foreground/50 text-foreground/85 font-medium ${
            showBookmark ? "pr-[4.5rem]" : "pr-16"
          }`}
          type="text"
          placeholder={placeholder}
          value={state.query}
          onChange={handleInput}
          onFocus={() => dispatch({ type: "openDropdown" })}
        />

        {state.loading && (
          <div className={`absolute top-1/2 -translate-y-1/2 ${showBookmark ? "right-[4rem]" : "right-10"}`}>
            <div className="w-3.5 h-3.5 border-2 border-foreground/10 border-t-foreground/50 rounded-full animate-spin" />
          </div>
        )}

        {showBookmark && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (alreadySaved) return;
              dispatch({ type: "openSavePopover", nicknameInput: value?.name || "" });
            }}
            className={`absolute right-10 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
              alreadySaved
                ? "text-primary/60 cursor-default"
                : "text-foreground/35 hover:text-foreground/60 hover:bg-foreground/[0.06]"
            }`}
            title={alreadySaved ? "Saved" : "Save this place"}
          >
            <Bookmark size={13} fill={alreadySaved ? "currentColor" : "none"} />
          </button>
        )}

        <button
          type="button"
          onClick={() => onStartPicking(isPicking ? null : pointId)}
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

      {state.showSavePopover && value && (
        <SavePlacePopover
          value={value}
          nicknameInput={state.nicknameInput}
          inputRef={nicknameInputRef}
          onChangeNickname={(nicknameInput) => dispatch({ type: "setNicknameInput", nicknameInput })}
          onCancel={() => dispatch({ type: "closeSavePopover" })}
          onSave={handleSave}
        />
      )}

      {state.showDropdown && !state.showSavePopover && (
        <SearchResultsDropdown
          errorMessage={state.errorMessage}
          canUseMyLocation={canUseMyLocation}
          results={state.results}
          savedLocations={savedLocations}
          onUseMyLocation={handleUseMyLocation}
          onSelectSavedLocation={(location) => {
            const displayName = location.nickname || location.name;
            dispatch({ type: "selectPlace", query: displayName });
            onSelect({ lat: location.lat, lng: location.lng, name: displayName });
          }}
          onSelectResult={handleSelect}
        />
      )}
    </div>
  );
}
