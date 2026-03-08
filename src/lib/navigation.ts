export type Overlay = "search" | "nearby" | "directions" | "route-detail" | null;

const VALID_OVERLAYS = new Set<string>(["search", "nearby", "directions", "route-detail"]);

interface HistoryStateShape extends Record<string, unknown> {
  _overlay?: Overlay;
  _overlayDepth?: number;
  _routeDetailIndex?: number | null;
}

export function parseOverlay(hash: string): Overlay {
  const value = hash.replace(/^#/, "");
  return VALID_OVERLAYS.has(value) ? (value as Overlay) : null;
}

/** Read the route-detail index stored in the current history entry. */
export function getRouteDetailIndex(): number | null {
  return (window.history.state as HistoryStateShape | null)?._routeDetailIndex ?? null;
}

/** Ensure the current entry has overlay metadata without clobbering router state. */
export function seedOverlayHistoryState() {
  const prevState = (window.history.state as HistoryStateShape | null) ?? {};
  const nextState: HistoryStateShape = {
    ...prevState,
    _overlay: parseOverlay(window.location.hash),
    _overlayDepth:
      typeof prevState._overlayDepth === "number" ? prevState._overlayDepth : 0,
    _routeDetailIndex: prevState._routeDetailIndex ?? null,
  };
  window.history.replaceState(nextState, "", window.location.href);
}

function getCurrentState(): HistoryStateShape {
  return (window.history.state as HistoryStateShape | null) ?? {};
}

interface NavigateOptions {
  replace?: boolean;
  /** Route index to persist in history state (only for route-detail overlay). */
  routeDetailIndex?: number;
}

/**
 * Navigate to an overlay (or back to the map when `null`).
 * Pushes a browser history entry and notifies the hash router via a
 * synthetic popstate event (since `pushState` doesn't fire one natively).
 *
 * Preserves existing `history.state` (e.g. Next.js router metadata).
 */
export function navigateTo(overlay: Overlay, { replace = false, routeDetailIndex }: NavigateOptions = {}) {
  const hash = overlay ? `#${overlay}` : "";
  const url = window.location.pathname + window.location.search + hash;
  // Preserve existing state (Next.js stores router metadata here)
  const prevState = getCurrentState();
  const nextState: HistoryStateShape = {
    ...prevState,
    _overlay: overlay,
    _overlayDepth: replace
      ? (typeof prevState._overlayDepth === "number" ? prevState._overlayDepth : 0)
      : (typeof prevState._overlayDepth === "number" ? prevState._overlayDepth : 0) + 1,
    _routeDetailIndex: routeDetailIndex ?? null,
  };
  if (replace) {
    history.replaceState(nextState, "", url);
  } else {
    history.pushState(nextState, "", url);
  }
  // pushState/replaceState don't fire popstate, so notify the router manually
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/**
 * Dismiss the current overlay without creating a new history entry.
 * Uses native back when the current entry was reached through in-app overlay navigation,
 * otherwise falls back to a replace navigation.
 */
export function dismissOverlay(fallbackOverlay: Overlay) {
  const currentState = getCurrentState();
  const currentOverlay = parseOverlay(window.location.hash);
  const currentDepth =
    typeof currentState._overlayDepth === "number" ? currentState._overlayDepth : 0;

  if (currentDepth > 0 && currentState._overlay === currentOverlay) {
    window.history.back();
    return;
  }

  navigateTo(fallbackOverlay, { replace: true });
}
