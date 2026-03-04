import { expect, test } from "@playwright/test";
import {
  nav,
  search,
  directions,
  layers,
  expectLayersOpen,
  expectLayersClosed,
  waitForHydration,
} from "../helpers/selectors";

test.describe("Bottom navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  test("Search tab opens search overlay", async ({ page }) => {
    await nav.searchTab(page).click();
    await expect(search.input(page)).toBeVisible();
    await expect(search.input(page)).toBeFocused();
  });

  test("Map tab returns from search to map", async ({ page }) => {
    await nav.searchTab(page).click();
    await expect(search.input(page)).toBeVisible();

    // force: true bypasses nextjs-portal dev overlay that can intercept clicks
    await nav.mapTab(page).click({ force: true });
    await expect(page.locator("canvas").first()).toBeVisible();
  });

  test("Nearby tab opens bottom sheet", async ({ page }) => {
    await nav.nearbyTab(page).click();
    await expect(page.getByText("Find nearby stops")).toBeVisible();
  });

  test("Directions tab opens route planner", async ({ page }) => {
    await nav.directionsTab(page).click();
    await expect(directions.originInput(page)).toBeVisible();
    await expect(directions.destinationInput(page)).toBeVisible();
  });

  test("Layers tab toggles layers menu", async ({ page }) => {
    await nav.layersTab(page).click();
    await expectLayersOpen(layers.vehiclesBtn(page));

    await nav.layersTab(page).click();
    await expectLayersClosed(layers.vehiclesBtn(page));
  });

  test("Content tab hides layers menu", async ({ page }) => {
    await nav.layersTab(page).click();
    await expectLayersOpen(layers.vehiclesBtn(page));

    await nav.searchTab(page).click();
    await expectLayersClosed(layers.vehiclesBtn(page));
    await expect(search.input(page)).toBeVisible();
  });
});
