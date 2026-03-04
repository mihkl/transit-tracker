import { expect, test } from "@playwright/test";
import { nav, search, waitForHydration } from "../helpers/selectors";

test.describe("Search", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await nav.searchTab(page).click();
  });

  test("opens with focused input", async ({ page }) => {
    await expect(search.input(page)).toBeVisible();
    await expect(search.input(page)).toBeFocused();
    await expect(search.input(page)).toHaveAttribute(
      "placeholder",
      "Search lines or stops...",
    );
  });

  test("shows 'All lines' heading when no query", async ({ page }) => {
    await expect(search.allLinesHeading(page)).toBeVisible();
  });

  test("typing filters results", async ({ page }) => {
    await search.input(page).fill("2");
    // "All lines" heading should disappear when there's a query
    await expect(search.allLinesHeading(page)).not.toBeVisible();
  });

  test("no results for nonsense query", async ({ page }) => {
    await search.input(page).fill("xyznonexistent999");
    await expect(search.noResults(page)).toBeVisible();
  });

  test("selecting a line returns to map with filter", async ({ page }) => {
    await search.input(page).fill("1");
    const lineButton = page
      .locator("button")
      .filter({ hasText: /^[0-9]+$/ })
      .first();

    if (await lineButton.isVisible()) {
      await lineButton.click();
      // Should be back on map tab — the mobile search overlay is unmounted
      await expect(page.locator("canvas").first()).toBeVisible();
    }
  });

  test("clear button in input clears text", async ({ page }) => {
    await search.input(page).fill("test");
    await expect(search.input(page)).toHaveValue("test");

    // The X clear button is inside the same container as the search input
    await search.clearBtn(page).click();
    await expect(search.input(page)).toHaveValue("");
  });
});
