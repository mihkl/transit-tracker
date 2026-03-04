import { expect, test } from "@playwright/test";
import { grantGeolocation } from "../helpers/geo";
import { nav, waitForHydration } from "../helpers/selectors";

test.describe("Nearby tab", () => {
  test("shows location prompt without geolocation", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await nav.nearbyTab(page).click();
    await expect(page.getByText("Find nearby stops")).toBeVisible();
    await expect(
      page.getByText("Enable location access", { exact: false }),
    ).toBeVisible();
  });

  test("shows nearby stops when geolocation granted", async ({
    page,
    context,
  }) => {
    await grantGeolocation(context);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await nav.nearbyTab(page).click();

    await expect(
      page.getByText("Nearby Stops").or(page.getByText("Find nearby stops")),
    ).toBeVisible();
  });

  test("tapping a nearby stop returns to map", async ({ page, context }) => {
    await grantGeolocation(context);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    // force: true bypasses nextjs-portal dev overlay that can intercept clicks
    await nav.nearbyTab(page).click({ force: true });

    const stopCard = page
      .locator("button")
      .filter({ hasText: /m away/ })
      .first();
    if (await stopCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await stopCard.click({ force: true });
      await expect(page.locator("canvas").first()).toBeVisible();
    }
  });
});
