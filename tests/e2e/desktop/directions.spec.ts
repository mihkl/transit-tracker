import { expect, test, type Page } from "@playwright/test";
import { waitForHydration } from "../helpers/selectors";

async function selectPlace(page: Page, placeholder: string, query: string) {
  const input = page.locator(`input[placeholder='${placeholder}']:visible`).first();
  await input.click();
  await input.fill("");
  await input.type(query, { delay: 50 });
  const firstResult = page.locator("[cmdk-item]:visible").filter({ hasText: /\S/ }).first();
  await expect(firstResult).toBeVisible({ timeout: 30_000 });
  await firstResult.click();
}

test.describe("Desktop directions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await page.getByRole("button", { name: "Directions" }).first().click();
    await expect(page.getByPlaceholder("From").first()).toBeVisible();
  });

  test("reorders a searched multi-stop journey and refreshes the sidebar automatically", async ({ page }) => {
    test.setTimeout(90_000);

    await selectPlace(page, "From", "Viru");
    await selectPlace(page, "To", "Balti jaam");
    await page.getByRole("button", { name: "Add stop" }).first().click();
    await selectPlace(page, "Stop 1", "Telliskivi");

    await page.locator("button:not(nav button)").filter({ hasText: /^Search$|^Searching$/ }).first().click();
    await expect(page.getByText("Viru Keskus to Telliskivi Creative City").first()).toBeVisible({
      timeout: 40_000,
    });

    await page.getByLabel("Move stop 1 down").click();

    await expect(page.getByText("Telliskivi Creative City to Viru Keskus").first()).toBeVisible({
      timeout: 40_000,
    });
  });
});
