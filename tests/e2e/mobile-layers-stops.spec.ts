import { expect, test, type Page } from "@playwright/test";

async function openLayersMenu(page: Page) {
  const layersTab = page.getByRole("button", { name: "Layers" });
  await expect(layersTab).toBeVisible();
  await layersTab.click();
}

async function expectStopsToggleVisible(page: Page) {
  const stopsToggle = page.getByRole("button", { name: "Stops" });
  await expect(stopsToggle).toBeVisible();
  await expect(stopsToggle).toBeEnabled();
}

test("mobile layers keeps Stops toggle after refresh reload", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await openLayersMenu(page);
  await expectStopsToggleVisible(page);

  for (let i = 0; i < 2; i += 1) {
    await page.reload({ waitUntil: "domcontentloaded" });
    await openLayersMenu(page);
    await expectStopsToggleVisible(page);
  }
});
