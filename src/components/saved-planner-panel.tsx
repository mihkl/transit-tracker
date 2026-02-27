"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

export interface SavedItemsData {
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

function coordsMatch(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  return Math.abs(a.lat - b.lat) < 0.0001 && Math.abs(a.lng - b.lng) < 0.0001;
}

export function SavedPlannerPanel({
  origin,
  destination,
  onSetOrigin,
  onSetDestination,
  saved,
}: SavedPlannerPanelProps) {
  const { routes, locations, loading, mutating, supported, saveRoute, removeRoute, removeLocation, updateNickname } = saved;

  const [open, setOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [editingLocId, setEditingLocId] = useState<string | null>(null);
  const [editNickname, setEditNickname] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const totalSaved = routes.length + locations.length;

  const canSave = !!origin && !!destination && !mutating;
  const isCurrentRouteSaved = useMemo(() => {
    if (!origin || !destination) return false;
    return routes.some(
      (r) => coordsMatch(r.origin, origin) && coordsMatch(r.destination, destination),
    );
  }, [origin, destination, routes]);

  const close = useCallback(() => setOpen(false), []);
  useClickOutside(wrapperRef, open ? close : () => {});

  // Measure position for fixed desktop dropdown.
  // Prefer aligning to the full controls row so panel edges match the planner card above.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !wrapperRef.current) {
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
        const width = Math.min(rowRect.width, maxWidth);
        setDropdownPos({ top: triggerRect.bottom + 8, left, width });
        return;
      }

      const fallbackWidth = 320;
      const fallbackLeft = Math.max(12, triggerRect.right - fallbackWidth);
      setDropdownPos({ top: triggerRect.bottom + 8, left: fallbackLeft, width: fallbackWidth });
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
  }, [open]);

  // Reset justSaved after animation
  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 1200);
    return () => clearTimeout(t);
  }, [justSaved]);

  const handleClick = async () => {
    // If route can be saved and isn't saved yet → save immediately
    if (canSave && !isCurrentRouteSaved) {
      const ok = await saveRoute(origin!, destination!);
      if (ok) setJustSaved(true);
      return;
    }
    // Otherwise toggle the panel
    setOpen((prev) => !prev);
  };

  const handleLoadRoute = (route: (typeof routes)[0]) => {
    onSetOrigin(route.origin);
    onSetDestination(route.destination);
    close();
  };

  const startEditingNickname = (loc: SavedLocationRecord) => {
    setEditingLocId(loc.id);
    setEditNickname(loc.nickname ?? "");
  };

  const commitNickname = async () => {
    if (!editingLocId) return;
    await updateNickname(editingLocId, editNickname);
    setEditingLocId(null);
  };

  if (!supported) return null;

  const panelContent = (
    <>
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-foreground/50">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm font-medium">Loading...</span>
        </div>
      ) : (
        <>
          {/* Saved routes */}
          {routes.length > 0 && (
            <div className="mb-1 mt-4">
              <div className="px-4 mb-1 text-[11px] uppercase tracking-wider text-foreground/40 font-semibold">
                Routes
              </div>
              <div>
                {routes.map((route) => (
                  <div key={route.id} className="flex items-center gap-1 px-2">
                    <button
                      type="button"
                      onClick={() => handleLoadRoute(route)}
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
                      onClick={() => void removeRoute(route.id)}
                      className="h-8 w-8 rounded-lg text-foreground/25 hover:text-red-400 hover:bg-red-50 flex items-center justify-center shrink-0 transition-colors active:scale-95"
                      aria-label="Delete route"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Saved locations */}
          {locations.length > 0 && (
            <div className="mb-1">
              <div className="px-4 mb-1 text-[11px] uppercase tracking-wider text-foreground/40 font-semibold">
                Places
              </div>
              <div>
                {locations.map((loc) => {
                  const displayName = loc.nickname || loc.name;
                  const isEditing = editingLocId === loc.id;
                  return (
                    <div key={loc.id} className="flex items-center gap-1 px-2">
                      <div className="flex-1 min-w-0 px-2.5 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <MapPin size={13} className="text-foreground/35 shrink-0" />
                          <div className="min-w-0 flex-1">
                            {isEditing ? (
                              <input
                                autoFocus
                                className="text-[13px] font-semibold text-foreground/80 bg-foreground/[0.03] border border-foreground/15 rounded-lg px-2 py-1 w-full outline-none focus:border-primary/30"
                                value={editNickname}
                                onChange={(e) => setEditNickname(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") void commitNickname();
                                  if (e.key === "Escape") setEditingLocId(null);
                                }}
                                onBlur={() => void commitNickname()}
                              />
                            ) : (
                              <>
                                <span className="text-[13px] font-semibold text-foreground/80 truncate block">
                                  {displayName}
                                </span>
                                {loc.nickname && (
                                  <span className="text-[11px] text-foreground/40 truncate block">
                                    {loc.name}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => startEditingNickname(loc)}
                        className="h-8 w-8 rounded-lg text-foreground/25 hover:text-foreground/50 hover:bg-foreground/[0.04] flex items-center justify-center shrink-0 transition-colors"
                        aria-label="Edit nickname"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeLocation(loc.id)}
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
          )}

          {/* Empty state */}
          {routes.length === 0 && locations.length === 0 && (
            <div className="px-4 py-8 text-center">
              <Bookmark size={28} className="mx-auto text-foreground/15 mb-2.5" />
              <div className="text-sm text-foreground/45 font-medium">
                No saved routes yet
              </div>
              <div className="text-xs text-foreground/30 mt-1 max-w-[220px] mx-auto">
                Set a start and destination, then tap the bookmark to save
              </div>
            </div>
          )}
        </>
      )}
    </>
  );

  /* ── Render ────────────────────────────────────────────── */

  // Button visual state
  const isSaved = isCurrentRouteSaved || justSaved;
  const buttonClass = justSaved
    ? "border-primary/40 text-primary bg-primary/10 scale-105"
    : isSaved
      ? "border-primary/25 text-primary bg-primary/[0.04]"
      : open
        ? "border-primary/30 text-primary bg-primary/[0.04]"
        : "border-foreground/10 text-foreground/50 hover:text-foreground/70 hover:bg-foreground/[0.04]";

  return (
    <div className="relative" ref={wrapperRef}>
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleClick}
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

      {/* Mobile bottom sheet */}
      {open && (
        <MobileSheet onClose={close}>
          {panelContent}
        </MobileSheet>
      )}

      {/* Desktop dropdown — fixed to escape overflow-hidden ancestors */}
      {open && dropdownPos && (
        <div
          className="hidden md:block fixed bg-white rounded-2xl border border-foreground/8 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.12)] z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
          style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
        >
          <div className="max-h-[400px] overflow-y-auto pb-2">
            {panelContent}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Mobile bottom sheet ─────────────────────────────────── */

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
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 animate-in fade-in duration-200"
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-[0_-8px_32px_-8px_rgba(0,0,0,0.1)] animate-in slide-in-from-bottom-4 duration-300 ${
          isDragging ? "" : "transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        }`}
        style={{ transform: `translateY(${dragY}px)` }}
      >
        {/* Drag handle */}
        <div
          className="flex justify-center pt-2.5 pb-1.5 touch-none"
          onTouchStart={(e) => beginDrag(e.touches[0].clientY)}
          onTouchMove={(e) => updateDrag(e.touches[0].clientY)}
          onTouchEnd={endDrag}
          onTouchCancel={endDrag}
        >
          <div className="w-9 h-1 rounded-full bg-foreground/20" />
        </div>

        {/* Content — pb-20 clears the bottom nav */}
        <div className="max-h-[55vh] overflow-y-auto pb-20">
          {children}
        </div>
      </div>
    </div>
  );
}
