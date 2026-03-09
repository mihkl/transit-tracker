"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from "react";
import {
  Bookmark,
  ChevronRight,
  Loader2,
  MapPin,
  Pencil,
  Route,
  Trash2,
} from "lucide-react";
import { useDragDismiss } from "@/hooks/use-drag-dismiss";
import { useClickOutside } from "@/hooks/use-click-outside";
import type { PlannerPointValue, SavedLocationRecord, SavedRouteRecord } from "@/lib/planner-persistence";

interface SavedItemsData {
  routes: SavedRouteRecord[];
  locations: SavedLocationRecord[];
  loading: boolean;
  mutating: boolean;
  supported: boolean;
  saveRoute: (origin: PlannerPointValue, destination: PlannerPointValue) => Promise<boolean>;
  removeRoute: (id: string) => Promise<boolean>;
  removeLocation: (id: string) => Promise<boolean>;
  updateNickname: (id: string, nickname: string) => Promise<boolean>;
}

interface SavedPlannerPanelProps {
  origin: PlannerPointValue | null;
  destination: PlannerPointValue | null;
  onSetOrigin: (place: { lat: number; lng: number; name: string }) => void;
  onSetDestination: (place: { lat: number; lng: number; name: string }) => void;
  saved: SavedItemsData;
}

interface SavedPlannerPanelState {
  open: boolean;
  justSaved: boolean;
  editingLocId: string | null;
  editNickname: string;
  dropdownPos: { top: number; left: number; width: number } | null;
}

const INITIAL_STATE: SavedPlannerPanelState = {
  open: false,
  justSaved: false,
  editingLocId: null,
  editNickname: "",
  dropdownPos: null,
};

type SavedPlannerAction =
  | { type: "close" }
  | { type: "toggleOpen" }
  | { type: "setJustSaved"; justSaved: boolean }
  | { type: "startEditing"; locationId: string; nickname: string }
  | { type: "setEditNickname"; nickname: string }
  | { type: "finishEditing" }
  | { type: "setDropdownPos"; dropdownPos: SavedPlannerPanelState["dropdownPos"] };

function savedPlannerPanelReducer(
  state: SavedPlannerPanelState,
  action: SavedPlannerAction,
): SavedPlannerPanelState {
  switch (action.type) {
    case "close":
      return { ...state, open: false };
    case "toggleOpen":
      return { ...state, open: !state.open };
    case "setJustSaved":
      return { ...state, justSaved: action.justSaved };
    case "startEditing":
      return {
        ...state,
        editingLocId: action.locationId,
        editNickname: action.nickname,
      };
    case "setEditNickname":
      return { ...state, editNickname: action.nickname };
    case "finishEditing":
      return { ...state, editingLocId: null };
    case "setDropdownPos":
      return { ...state, dropdownPos: action.dropdownPos };
    default:
      return state;
  }
}

function coordsMatch(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  return Math.abs(a.lat - b.lat) < 0.0001 && Math.abs(a.lng - b.lng) < 0.0001;
}

function SavedRoutesSection({
  routes,
  onLoadRoute,
  onRemoveRoute,
}: {
  routes: SavedRouteRecord[];
  onLoadRoute: (route: SavedRouteRecord) => void;
  onRemoveRoute: (id: string) => void;
}) {
  if (routes.length === 0) return null;

  return (
    <div className="mb-1 mt-4">
      <div className="px-4 mb-1 text-[11px] uppercase tracking-wider text-foreground/40 font-semibold">
        Routes
      </div>
      <div>
        {routes.map((route) => (
          <div key={route.id} className="flex items-center gap-1 px-2">
            <button
              type="button"
              onClick={() => onLoadRoute(route)}
              className="flex-1 min-w-0 flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl hover:bg-foreground/[0.04] active:bg-foreground/[0.07] transition-colors text-left"
            >
              <Route size={14} className="text-foreground/35 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-foreground/80 truncate">
                  {route.origin.name}
                </div>
                <div className="text-[11px] text-foreground/45 truncate mt-0.5 flex items-center gap-1">
                  <ChevronRight size={10} className="shrink-0 text-foreground/30" />
                  {route.destination.name}
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => onRemoveRoute(route.id)}
              className="h-8 w-8 rounded-lg text-foreground/25 hover:text-red-400 hover:bg-red-50 flex items-center justify-center shrink-0 transition-colors active:scale-95"
              aria-label="Delete route"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SavedLocationsSection({
  locations,
  editingLocId,
  editNickname,
  nicknameInputRef,
  onEditNicknameChange,
  onStartEditing,
  onCommitNickname,
  onCancelEditing,
  onRemoveLocation,
}: {
  locations: SavedLocationRecord[];
  editingLocId: string | null;
  editNickname: string;
  nicknameInputRef: React.RefObject<HTMLInputElement | null>;
  onEditNicknameChange: (nickname: string) => void;
  onStartEditing: (location: SavedLocationRecord) => void;
  onCommitNickname: () => void;
  onCancelEditing: () => void;
  onRemoveLocation: (id: string) => void;
}) {
  if (locations.length === 0) return null;

  return (
    <div className="mb-1">
      <div className="px-4 mb-1 mt-4 text-[11px] uppercase tracking-wider text-foreground/40 font-semibold">
        Places
      </div>
      <div>
        {locations.map((location) => {
          const displayName = location.nickname || location.name;
          const isEditing = editingLocId === location.id;
          return (
            <div key={location.id} className="flex items-center gap-1 px-2">
              <div className="flex-1 min-w-0 px-2.5 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin size={13} className="text-foreground/35 shrink-0" />
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <input
                        ref={nicknameInputRef}
                        className="text-[13px] font-semibold text-foreground/80 bg-foreground/[0.03] border border-foreground/15 rounded-lg px-2 py-1 w-full outline-none focus:border-primary/30"
                        value={editNickname}
                        onChange={(event) => onEditNicknameChange(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void onCommitNickname();
                          if (event.key === "Escape") onCancelEditing();
                        }}
                        onBlur={() => void onCommitNickname()}
                      />
                    ) : (
                      <>
                        <span className="text-[13px] font-semibold text-foreground/80 truncate block">
                          {displayName}
                        </span>
                        {location.nickname && (
                          <span className="text-[11px] text-foreground/40 truncate block">
                            {location.name}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onStartEditing(location)}
                className="h-8 w-8 rounded-lg text-foreground/25 hover:text-foreground/50 hover:bg-foreground/[0.04] flex items-center justify-center shrink-0 transition-colors"
                aria-label="Edit nickname"
              >
                <Pencil size={12} />
              </button>
              <button
                type="button"
                onClick={() => onRemoveLocation(location.id)}
                className="h-8 w-8 rounded-lg text-foreground/25 hover:text-red-400 hover:bg-red-50 flex items-center justify-center shrink-0 transition-colors active:scale-95"
                aria-label="Delete location"
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptySavedState() {
  return (
    <div className="px-4 py-8 text-center">
      <Bookmark size={28} className="mx-auto text-foreground/15 mb-2.5" />
      <div className="text-sm text-foreground/45 font-medium">
        No saved routes yet
      </div>
      <div className="text-xs text-foreground/30 mt-1 max-w-[220px] mx-auto">
        Set a start and destination, then tap the bookmark to save
      </div>
    </div>
  );
}

function SavedItemsPanelContent({
  loading,
  routes,
  locations,
  editingLocId,
  editNickname,
  nicknameInputRef,
  onLoadRoute,
  onRemoveRoute,
  onStartEditing,
  onEditNicknameChange,
  onCommitNickname,
  onCancelEditing,
  onRemoveLocation,
}: {
  loading: boolean;
  routes: SavedRouteRecord[];
  locations: SavedLocationRecord[];
  editingLocId: string | null;
  editNickname: string;
  nicknameInputRef: React.RefObject<HTMLInputElement | null>;
  onLoadRoute: (route: SavedRouteRecord) => void;
  onRemoveRoute: (id: string) => void;
  onStartEditing: (location: SavedLocationRecord) => void;
  onEditNicknameChange: (nickname: string) => void;
  onCommitNickname: () => void;
  onCancelEditing: () => void;
  onRemoveLocation: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-foreground/50">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm font-medium">Loading...</span>
      </div>
    );
  }

  return (
    <>
      <SavedRoutesSection
        routes={routes}
        onLoadRoute={onLoadRoute}
        onRemoveRoute={onRemoveRoute}
      />
      <SavedLocationsSection
        locations={locations}
        editingLocId={editingLocId}
        editNickname={editNickname}
        nicknameInputRef={nicknameInputRef}
        onEditNicknameChange={onEditNicknameChange}
        onStartEditing={onStartEditing}
        onCommitNickname={onCommitNickname}
        onCancelEditing={onCancelEditing}
        onRemoveLocation={onRemoveLocation}
      />
      {routes.length === 0 && locations.length === 0 && <EmptySavedState />}
    </>
  );
}

function SavedPlannerTrigger({
  triggerRef,
  totalSaved,
  isSaved,
  open,
  mutating,
  canSave,
  isCurrentRouteSaved,
  onClick,
}: {
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  totalSaved: number;
  isSaved: boolean;
  open: boolean;
  mutating: boolean;
  canSave: boolean;
  isCurrentRouteSaved: boolean;
  onClick: () => void;
}) {
  const buttonClass = isSaved
    ? "border-primary/25 text-primary bg-primary/[0.04]"
    : open
      ? "border-primary/30 text-primary bg-primary/[0.04]"
      : "border-foreground/10 text-foreground/50 hover:text-foreground/70 hover:bg-foreground/[0.04]";

  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={onClick}
      disabled={mutating}
      className={`h-10 w-10 rounded-xl border bg-white flex items-center justify-center relative transition-all duration-200 active:scale-[0.97] shrink-0 disabled:opacity-60 ${buttonClass}`}
      title={
        canSave && !isCurrentRouteSaved
          ? "Save this route"
          : "Saved routes & places"
      }
      aria-label={
        canSave && !isCurrentRouteSaved
          ? "Save this route"
          : "Open saved routes and places"
      }
    >
      <Bookmark size={16} fill={isSaved ? "currentColor" : "none"} className="transition-all duration-200" />
      {totalSaved > 0 && !open && !isSaved && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center px-1 shadow-sm pointer-events-none">
          {totalSaved}
        </span>
      )}
    </button>
  );
}

function MobileSheet({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { dragY, isDragging, beginDrag, updateDrag, endDrag } = useDragDismiss({
    thresholdPx: 100,
    velocityThreshold: 0.7,
    onDismiss: onClose,
  });

  return (
    <div className="md:hidden fixed inset-0 z-[1150]">
      <button
        type="button"
        className="absolute inset-0 bg-black/20 animate-in fade-in duration-200"
        onClick={onClose}
        aria-label="Close saved routes and places"
      />
      <div
        className={`absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-[0_-8px_32px_-8px_rgba(0,0,0,0.1)] animate-in slide-in-from-bottom-4 duration-300 ${
          isDragging ? "" : "transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        }`}
        style={{ transform: `translateY(${dragY}px)` }}
      >
        <div
          className="flex justify-center pt-2.5 pb-1.5 touch-none"
          onTouchStart={(event) => beginDrag(event.touches[0].clientY)}
          onTouchMove={(event) => updateDrag(event.touches[0].clientY)}
          onTouchEnd={endDrag}
          onTouchCancel={endDrag}
        >
          <div className="w-9 h-1 rounded-full bg-foreground/20" />
        </div>
        <div className="max-h-[55vh] overflow-y-auto pb-20">
          {children}
        </div>
      </div>
    </div>
  );
}

export function SavedPlannerPanel({
  origin,
  destination,
  onSetOrigin,
  onSetDestination,
  saved,
}: SavedPlannerPanelProps) {
  const {
    routes,
    locations,
    loading,
    mutating,
    supported,
    saveRoute,
    removeRoute,
    removeLocation,
    updateNickname,
  } = saved;
  const [state, dispatch] = useReducer(savedPlannerPanelReducer, INITIAL_STATE);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const nicknameInputRef = useRef<HTMLInputElement>(null);

  const totalSaved = routes.length + locations.length;
  const canSave = !!origin && !!destination && !mutating;
  const isCurrentRouteSaved = useMemo(() => {
    if (!origin || !destination) return false;
    return routes.some(
      (route) => coordsMatch(route.origin, origin) && coordsMatch(route.destination, destination),
    );
  }, [destination, origin, routes]);

  const close = useCallback(() => {
    dispatch({ type: "close" });
  }, []);

  useClickOutside(wrapperRef, state.open ? close : () => {});

  useLayoutEffect(() => {
    if (!state.open || !triggerRef.current || !wrapperRef.current) {
      return;
    }

    let rafId = 0;
    const updatePosition = () => {
      if (!triggerRef.current || !wrapperRef.current) {
        return;
      }

      const triggerRect = triggerRef.current.getBoundingClientRect();
      const rowRect = wrapperRef.current.parentElement?.getBoundingClientRect();
      if (rowRect && rowRect.width > 0) {
        const left = Math.max(12, rowRect.left);
        const maxWidth = window.innerWidth - left - 12;
        dispatch({
          type: "setDropdownPos",
          dropdownPos: {
            top: triggerRect.bottom + 8,
            left,
            width: Math.min(rowRect.width, maxWidth),
          },
        });
        return;
      }

      const fallbackWidth = 320;
      dispatch({
        type: "setDropdownPos",
        dropdownPos: {
          top: triggerRect.bottom + 8,
          left: Math.max(12, triggerRect.right - fallbackWidth),
          width: fallbackWidth,
        },
      });
    };

    const scheduleUpdate = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updatePosition);
    };

    scheduleUpdate();
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [state.open]);

  useEffect(() => {
    if (!state.justSaved) return;
    const timeoutId = setTimeout(() => {
      dispatch({ type: "setJustSaved", justSaved: false });
    }, 1200);
    return () => clearTimeout(timeoutId);
  }, [state.justSaved]);

  useEffect(() => {
    if (state.editingLocId) {
      nicknameInputRef.current?.focus();
      nicknameInputRef.current?.select();
    }
  }, [state.editingLocId]);

  const handleClickAsync = useCallback(async () => {
    if (canSave && !isCurrentRouteSaved && origin && destination) {
      const savedRoute = await saveRoute(origin, destination);
      if (savedRoute) {
        dispatch({ type: "setJustSaved", justSaved: true });
      }
      return;
    }

    dispatch({ type: "toggleOpen" });
  }, [canSave, destination, isCurrentRouteSaved, origin, saveRoute]);

  const handleLoadRoute = useCallback((route: SavedRouteRecord) => {
    onSetOrigin(route.origin);
    onSetDestination(route.destination);
    close();
  }, [close, onSetDestination, onSetOrigin]);

  const handleStartEditing = useCallback((location: SavedLocationRecord) => {
    dispatch({
      type: "startEditing",
      locationId: location.id,
      nickname: location.nickname ?? "",
    });
  }, []);

  const handleCommitNickname = useCallback(async () => {
    if (!state.editingLocId) return;
    await updateNickname(state.editingLocId, state.editNickname);
    dispatch({ type: "finishEditing" });
  }, [state.editNickname, state.editingLocId, updateNickname]);

  if (!supported) return null;

  const isSaved = isCurrentRouteSaved || state.justSaved;

  return (
    <div className="relative" ref={wrapperRef}>
      <SavedPlannerTrigger
        triggerRef={triggerRef}
        totalSaved={totalSaved}
        isSaved={isSaved}
        open={state.open}
        mutating={mutating}
        canSave={canSave}
        isCurrentRouteSaved={isCurrentRouteSaved}
        onClick={() => void handleClickAsync()}
      />

      {state.open && (
        <MobileSheet onClose={close}>
          <SavedItemsPanelContent
            loading={loading}
            routes={routes}
            locations={locations}
            editingLocId={state.editingLocId}
            editNickname={state.editNickname}
            nicknameInputRef={nicknameInputRef}
            onLoadRoute={handleLoadRoute}
            onRemoveRoute={(id) => void removeRoute(id)}
            onStartEditing={handleStartEditing}
            onEditNicknameChange={(nickname) =>
              dispatch({ type: "setEditNickname", nickname })
            }
            onCommitNickname={() => void handleCommitNickname()}
            onCancelEditing={() => dispatch({ type: "finishEditing" })}
            onRemoveLocation={(id) => void removeLocation(id)}
          />
        </MobileSheet>
      )}

      {state.open && state.dropdownPos && (
        <div
          className="hidden md:block fixed bg-white rounded-2xl border border-foreground/8 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.12)] z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
          style={{
            top: state.dropdownPos.top,
            left: state.dropdownPos.left,
            width: state.dropdownPos.width,
          }}
        >
          <div className="max-h-[400px] overflow-y-auto pb-2">
            <SavedItemsPanelContent
              loading={loading}
              routes={routes}
              locations={locations}
              editingLocId={state.editingLocId}
              editNickname={state.editNickname}
              nicknameInputRef={nicknameInputRef}
              onLoadRoute={handleLoadRoute}
              onRemoveRoute={(id) => void removeRoute(id)}
              onStartEditing={handleStartEditing}
              onEditNicknameChange={(nickname) =>
                dispatch({ type: "setEditNickname", nickname })
              }
              onCommitNickname={() => void handleCommitNickname()}
              onCancelEditing={() => dispatch({ type: "finishEditing" })}
              onRemoveLocation={(id) => void removeLocation(id)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
