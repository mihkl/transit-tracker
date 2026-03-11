import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Wait for React hydration. The map canvas is created client-side by
 * MapLibre GL only after React has hydrated, so its presence guarantees
 * that event handlers on all components are active.
 */
export async function waitForHydration(page: Page) {
  await page.locator("canvas").first().waitFor({ timeout: 15_000 });
}

// Bottom navigation lives inside <nav>, scoping avoids conflicts
// with other "Search" buttons (e.g. route planner)
export const nav = {
  mapTab: (p: Page) => p.locator("nav").getByRole("button", { name: "Map" }),
  nearbyTab: (p: Page) =>
    p.locator("nav").getByRole("button", { name: "Nearby" }),
  searchTab: (p: Page) =>
    p.locator("nav").getByRole("button", { name: "Search" }),
  directionsTab: (p: Page) =>
    p.locator("nav").getByRole("button", { name: "Directions" }),
};

// Mobile layers are accessed via a FAB (floating action button) in the
// bottom-right corner. The individual layer buttons use tabindex 0/-1
// to indicate open/closed state.
export const layers = {
  fab: (p: Page) => p.getByLabel("Toggle layers"),
  vehiclesBtn: (p: Page) =>
    p.locator("button").filter({ hasText: "Vehicles" }).last(),
  trafficBtn: (p: Page) =>
    p.locator("button").filter({ hasText: "Traffic" }).last(),
  stopsBtn: (p: Page) =>
    p.locator("button").filter({ hasText: "Stops" }).last(),
};

/** Open the mobile layers menu via the FAB. */
export async function openLayersMenu(page: Page) {
  await layers.fab(page).click();
  await expectLayersOpen(layers.stopsBtn(page));
}

/** Assert the layers menu is open (buttons are interactive). */
export async function expectLayersOpen(btn: Locator) {
  await expect(btn).toHaveAttribute("tabindex", "0");
}

/** Assert the layers menu is closed (buttons are non-interactive). */
export async function expectLayersClosed(btn: Locator) {
  await expect(btn).toHaveAttribute("tabindex", "-1");
}

// Desktop and mobile both render PlaceSearchInput ("From"/"To") and
// the unified search input. The mobile versions render last in the DOM,
// so .last() grabs the mobile instance on Pixel 7 viewport.
export const search = {
  input: (p: Page) =>
    p.getByPlaceholder("Search lines or stops...").last(),
  clearBtn: (p: Page) =>
    p.locator("input[placeholder='Search lines or stops...']").last()
      .locator("xpath=..").locator("button"),
  noResults: (p: Page) => p.getByText("No results found"),
  allLinesHeading: (p: Page) => p.getByText("All lines"),
};

export const directions = {
  originInput: (p: Page) => p.getByPlaceholder("From").last(),
  destinationInput: (p: Page) => p.getByPlaceholder("To").last(),
  stopInput: (p: Page, index: number) => p.getByPlaceholder(`Stop ${index}`).last(),
  swapBtn: (p: Page) =>
    p.locator("button").filter({ hasText: /^Swap$/ }).last(),
  timeSelect: (p: Page) => p.locator("select").last(),
  datetimeInput: (p: Page) =>
    p.locator("input[type='datetime-local']").last(),
  addStopBtn: (p: Page) => p.locator("button").filter({ hasText: /^Add stop$/ }).last(),
  returnToStartBtn: (p: Page) => p.locator("button").filter({ hasText: /^Return$/ }).last(),
  // Exclude the bottom nav "Search" button by scoping outside <nav>
  searchBtn: (p: Page) =>
    p.locator("button:not(nav button)")
      .filter({ hasText: /^Search$|^Searching$/ })
      .last(),
  resetBtn: (p: Page) => p.locator("button").filter({ hasText: /^Reset$/ }).last(),
};
