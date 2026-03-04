import { expect, test } from "@playwright/test";
import { nav, waitForHydration } from "../helpers/selectors";

test.describe("Map page load", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  test("shows bottom navigation with all tabs", async ({ page }) => {
    await expect(nav.mapTab(page)).toBeVisible();
    await expect(nav.nearbyTab(page)).toBeVisible();
    await expect(nav.searchTab(page)).toBeVisible();
    await expect(nav.directionsTab(page)).toBeVisible();
    await expect(nav.layersTab(page)).toBeVisible();
  });

  test("map canvas renders", async ({ page }) => {
    const canvas = page.locator("canvas").first();
    await expect(canvas).toBeVisible();
  });
});
