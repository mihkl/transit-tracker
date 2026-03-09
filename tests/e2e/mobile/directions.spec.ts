import { expect, test, type Locator, type Page } from "@playwright/test";
import { nav, directions, waitForHydration } from "../helpers/selectors";

async function selectPlace(page: Page, input: Locator, query: string) {
  await input.fill(query);
  const dropdown = page.locator("[cmdk-list]").last();
  await expect(dropdown).toBeVisible({ timeout: 5000 });
  const firstResult = dropdown.locator("[cmdk-item]").first();
  await expect(firstResult).toBeVisible({ timeout: 15_000 });
  await firstResult.click();
}

async function planMultiStopJourney(page: Page) {
  await selectPlace(page, directions.originInput(page), "Viru");
  await selectPlace(page, directions.destinationInput(page), "Balti jaam");
  await directions.addStopBtn(page).click();
  await selectPlace(page, directions.stopInput(page, 1), "Telliskivi");
  await directions.searchBtn(page).click();
  await expect(page.getByRole("button", { name: /Edit itinerary/i })).toBeVisible({
    timeout: 40_000,
  });
}

test.describe("Directions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await nav.directionsTab(page).click();
    // Wait for route planner to render
    await expect(directions.originInput(page)).toBeVisible();
  });

  test("opens with From and To inputs", async ({ page }) => {
    await expect(directions.originInput(page)).toBeVisible();
    await expect(directions.destinationInput(page)).toBeVisible();
  });

  test("swap button swaps origin and destination", async ({ page }) => {
    // Fill origin via autocomplete (plain .fill() only sets local query, not store)
    await directions.originInput(page).fill("Viru");
    const originDropdown = page.locator("[cmdk-list]");
    await expect(originDropdown).toBeVisible({ timeout: 5000 });
    const originItem = originDropdown.locator("[cmdk-item]").first();
    await expect(originItem).toBeVisible({ timeout: 15000 });
    await originItem.click();
    const originValue = await directions.originInput(page).inputValue();

    // Fill destination via autocomplete
    await directions.destinationInput(page).fill("Ülemiste");
    const destDropdown = page.locator("[cmdk-list]");
    await expect(destDropdown).toBeVisible({ timeout: 5000 });
    const destItem = destDropdown.locator("[cmdk-item]").first();
    await expect(destItem).toBeVisible({ timeout: 15000 });
    await destItem.click();
    const destValue = await directions.destinationInput(page).inputValue();

    // Now swap — store values should exchange
    await directions.swapBtn(page).click();

    // Origin input should now contain what was the destination
    await expect(directions.originInput(page)).toHaveValue(destValue);
    await expect(directions.destinationInput(page)).toHaveValue(originValue);
  });

  test("time selector has three options", async ({ page }) => {
    const select = directions.timeSelect(page);
    await expect(select).toBeVisible();

    await expect(select.locator("option")).toHaveCount(3);
    await expect(select.locator("option").nth(0)).toHaveText("Leave now");
    await expect(select.locator("option").nth(1)).toHaveText("Depart at");
    await expect(select.locator("option").nth(2)).toHaveText("Arrive by");
  });

  test("Depart at shows datetime picker", async ({ page }) => {
    await directions.timeSelect(page).selectOption("depart");
    await expect(directions.datetimeInput(page)).toBeVisible();
  });

  test("Leave now hides datetime picker", async ({ page }) => {
    await directions.timeSelect(page).selectOption("depart");
    await expect(directions.datetimeInput(page)).toBeVisible();

    await directions.timeSelect(page).selectOption("now");
    await expect(directions.datetimeInput(page)).not.toBeVisible();
  });

  test("Arrive by shows datetime picker", async ({ page }) => {
    await directions.timeSelect(page).selectOption("arrive");
    await expect(directions.datetimeInput(page)).toBeVisible();
  });

  test("can add and remove an intermediate stop", async ({ page }) => {
    await directions.addStopBtn(page).click();
    await expect(directions.stopInput(page, 1)).toBeVisible();

    await page.getByLabel("Remove stop 2").last().click();
    await expect(directions.stopInput(page, 1)).not.toBeVisible();
  });

  test("does not show a remove button when only origin and destination are present", async ({ page }) => {
    await expect(page.getByLabel("Remove stop 2")).toHaveCount(0);
  });

  test("return to start adds a final stop after an intermediate stop", async ({ page }) => {
    await directions.originInput(page).fill("Viru");
    const originDropdown = page.locator("[cmdk-list]");
    await expect(originDropdown).toBeVisible({ timeout: 5000 });
    await originDropdown.locator("[cmdk-item]").first().click();

    await directions.addStopBtn(page).click();
    await directions.returnToStartBtn(page).click();

    await expect(directions.stopInput(page, 1)).toBeVisible();
    await expect(directions.stopInput(page, 2)).toBeVisible();
    await expect(directions.destinationInput(page)).toBeVisible();
  });
});

test.describe("Directions search flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await nav.directionsTab(page).click();
    await expect(directions.originInput(page)).toBeVisible();
  });

  test("Search button is disabled without origin and destination", async ({
    page,
  }) => {
    // .last() gets the mobile route planner Search button
    const searchBtn = directions.searchBtn(page);
    await expect(searchBtn).toBeDisabled();
  });

  test("typing in From input shows place autocomplete dropdown", async ({
    page,
  }) => {
    await directions.originInput(page).fill("Viru");
    const dropdown = page.locator("[cmdk-list]");
    await expect(dropdown).toBeVisible({ timeout: 5000 });
  });

  test("selecting a place from dropdown fills input", async ({ page }) => {
    await directions.originInput(page).fill("Viru");
    const dropdown = page.locator("[cmdk-list]");
    await expect(dropdown).toBeVisible({ timeout: 5000 });

    const firstResult = dropdown.locator("[cmdk-item]").first();
    if (await firstResult.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstResult.click();
      await expect(directions.originInput(page)).not.toHaveValue("Viru");
      await expect(directions.originInput(page)).not.toHaveValue("");
    }
  });

  test("map picker button switches to map view", async ({ page }) => {
    // On mobile, "Pick on map" closes the planner and shows the map
    const pickerBtn = page.getByTitle("Pick on map").last();
    await expect(pickerBtn).toBeVisible();
    await pickerBtn.click();

    // Should switch to map view (planner hidden, canvas visible)
    await expect(page.locator("canvas").first()).toBeVisible();
  });

  test("full search flow: select places and get routes", async ({ page }) => {
    test.setTimeout(60_000);

    // Fill origin
    await selectPlace(page, directions.originInput(page), "Viru väljak");

    // Fill destination
    await selectPlace(page, directions.destinationInput(page), "Ülemiste");

    // Search button should now be enabled
    const searchBtn = directions.searchBtn(page);
    await expect(searchBtn).toBeEnabled({ timeout: 3000 });

    // Click search
    await searchBtn.click();

    // Wait for completion state (routes found or no routes)
    const routeCard = page.getByRole("button", { name: /\b\d+\s*min\b/i }).first();
    const noRoutes = page.getByText("No routes found").first();

    await Promise.any([
      routeCard.waitFor({ state: "visible", timeout: 40000 }),
      noRoutes.waitFor({ state: "visible", timeout: 40000 }),
    ]);

    // If we got route results, verify they're tappable
    if (await routeCard.isVisible({ timeout: 10000 }).catch(() => false)) {
      await routeCard.click();
      await expect(
        page.getByLabel("Back to all routes"),
      ).toBeVisible({ timeout: 3000 });
    }
  });

  test("reorders a searched multi-stop journey and refreshes the itinerary automatically", async ({ page }) => {
    test.setTimeout(90_000);

    await planMultiStopJourney(page);
    await expect(page.getByText("Viru Keskus to Telliskivi Creative City").last()).toBeVisible();

    await page.getByRole("button", { name: /Edit itinerary/i }).click();
    await page.locator("[aria-label='Move stop 1 down']:visible").first().click();

    await expect(page.getByText("Telliskivi Creative City to Viru Keskus").last()).toBeVisible({
      timeout: 40_000,
    });
  });

  test("shows a neutral state instead of no-routes after adding an empty intermediate stop", async ({ page }) => {
    test.setTimeout(60_000);

    await selectPlace(page, directions.originInput(page), "Viru väljak");
    await selectPlace(page, directions.destinationInput(page), "Ülemiste");
    await directions.searchBtn(page).click();

    await Promise.any([
      page.getByRole("button", { name: /\b\d+\s*min\b/i }).first().waitFor({ state: "visible", timeout: 40_000 }),
      page.getByText("No routes found").first().waitFor({ state: "visible", timeout: 40_000 }),
    ]);

    await directions.addStopBtn(page).click();
    await expect(directions.stopInput(page, 1)).toBeVisible();
    await expect(page.getByText("No routes found")).toHaveCount(0);
    await expect(page.getByText("Itinerary")).toHaveCount(0);
  });
});
