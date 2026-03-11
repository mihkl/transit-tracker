import { expect, test, type Page } from "@playwright/test";
import {
  layers,
  expectLayersOpen,
  expectLayersClosed,
  waitForHydration,
} from "../helpers/selectors";

async function openLayersMenu(page: Page) {
  await layers.fab(page).click();
  await expectLayersOpen(layers.stopsBtn(page));
}

test.describe("Layers menu", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  test("Stops toggle persists after reload", async ({ page }) => {
    await openLayersMenu(page);
    await expect(layers.stopsBtn(page)).toBeEnabled();

    for (let i = 0; i < 2; i++) {
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      await openLayersMenu(page);
      await expect(layers.stopsBtn(page)).toBeEnabled();
    }
  });

  test("Vehicles button toggles active state", async ({ page }) => {
    await openLayersMenu(page);
    await layers.vehiclesBtn(page).click();

    // Menu closes after toggle
    await expectLayersClosed(layers.vehiclesBtn(page));

    // Reopen and check active state (has bg-primary class)
    await openLayersMenu(page);
    await expect(layers.vehiclesBtn(page)).toHaveClass(/bg-primary/);
  });

  test("Traffic button toggles active state", async ({ page }) => {
    await openLayersMenu(page);
    await layers.trafficBtn(page).click();

    await expectLayersClosed(layers.trafficBtn(page));

    await openLayersMenu(page);
    await expectLayersOpen(layers.trafficBtn(page));
  });

  test("Stops button toggles active state", async ({ page }) => {
    await openLayersMenu(page);
    await layers.stopsBtn(page).click();

    await expectLayersClosed(layers.stopsBtn(page));

    await openLayersMenu(page);
    await expectLayersOpen(layers.stopsBtn(page));
  });

  test("toggling a layer closes the menu", async ({ page }) => {
    await openLayersMenu(page);
    await layers.vehiclesBtn(page).click();
    await expectLayersClosed(layers.vehiclesBtn(page));
  });

  test("multiple layers can be active simultaneously", async ({ page }) => {
    await openLayersMenu(page);
    await layers.vehiclesBtn(page).click();

    await openLayersMenu(page);
    await layers.stopsBtn(page).click();

    // Reopen and verify both are still toggled
    await openLayersMenu(page);
    await expectLayersOpen(layers.vehiclesBtn(page));
    await expectLayersOpen(layers.stopsBtn(page));
  });
});
