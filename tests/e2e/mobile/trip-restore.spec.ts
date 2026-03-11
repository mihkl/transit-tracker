import { expect, test, type Page } from "@playwright/test";
import { waitForHydration } from "../helpers/selectors";

// Minimal but valid PlannedRoute fixture
function makeFakeRoute(scheduledDeparture: string) {
  return {
    duration: "1200s",
    distanceMeters: "5000",
    overviewPolyline: [
      [59.437, 24.745],
      [59.432, 24.762],
    ],
    legs: [
      {
        mode: "WALK",
        duration: "180s",
        distanceMeters: "200",
        polyline: [
          [59.437, 24.745],
          [59.436, 24.746],
        ],
      },
      {
        mode: "BUS",
        lineNumber: "17",
        lineName: "Kopli - Vana-Pääsküla",
        departureStop: "Viru",
        arrivalStop: "Balti jaam",
        departureStopLat: 59.436,
        departureStopLng: 24.746,
        arrivalStopLat: 59.44,
        arrivalStopLng: 24.737,
        scheduledDeparture,
        scheduledArrival: new Date(
          new Date(scheduledDeparture).getTime() + 15 * 60_000,
        ).toISOString(),
        numStops: 5,
        duration: "900s",
        distanceMeters: "4000",
        polyline: [
          [59.436, 24.746],
          [59.44, 24.737],
        ],
      },
      {
        mode: "WALK",
        duration: "120s",
        distanceMeters: "150",
        polyline: [
          [59.44, 24.737],
          [59.44, 24.735],
        ],
      },
    ],
  };
}

function makeFakePlannerStops() {
  return [
    {
      id: "stop-1",
      point: { lat: 59.437, lng: 24.745, name: "Tallinn Airport" },
      dwellMinutes: 0,
      departureOverride: "",
    },
    {
      id: "stop-2",
      point: { lat: 59.44, lng: 24.735, name: "Balti jaam" },
      dwellMinutes: 0,
      departureOverride: "",
    },
  ];
}

function seedSnapshot(
  page: Page,
  route: ReturnType<typeof makeFakeRoute>,
  plannerStops?: ReturnType<typeof makeFakePlannerStops>,
) {
  return page.addInitScript(
    ({ route, plannerStops }) => {
      localStorage.setItem(
        "transit-reminder-route-snapshot",
        JSON.stringify({ route, plannerStops, savedAt: Date.now() }),
      );
    },
    { route, plannerStops },
  );
}

function seedExpiredSnapshot(
  page: Page,
  route: ReturnType<typeof makeFakeRoute>,
) {
  return page.addInitScript(
    ({ route }) => {
      localStorage.setItem(
        "transit-reminder-route-snapshot",
        JSON.stringify({
          route,
          savedAt: Date.now() - 13 * 60 * 60 * 1000, // 13h ago > 12h max
        }),
      );
    },
    { route },
  );
}

// ---------------------------------------------------------------------------
// Cold-start tests: ?trip=1 opens the app and restores from localStorage.
// These don't need service workers — the SW listener is a separate path.
// ---------------------------------------------------------------------------
test.describe("Trip restore — cold start (?trip=1)", () => {
  test("restores route and planner stop names from snapshot", async ({
    page,
  }) => {
    const departure = new Date(Date.now() + 30 * 60_000).toISOString();
    await seedSnapshot(page, makeFakeRoute(departure), makeFakePlannerStops());

    await page.goto("/?trip=1", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    // Directions overlay should be visible with the saved stop names
    const fromInput = page.getByPlaceholder("From").last();
    await expect(fromInput).toHaveValue("Tallinn Airport", { timeout: 8000 });

    const toInput = page.getByPlaceholder("To").last();
    await expect(toInput).toHaveValue("Balti jaam");

    // ?trip=1 must be stripped from URL
    expect(page.url()).not.toContain("trip=1");
  });

  test("shows unavailable banner when no snapshot exists", async ({
    page,
  }) => {
    await page.goto("/?trip=1", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    // The unavailable banner auto-dismisses after 5s, check quickly
    await expect(
      page.getByText("Your trip details are no longer available"),
    ).toBeVisible({ timeout: 5000 });

    expect(page.url()).not.toContain("trip=1");
  });

  test("shows unavailable banner when snapshot is expired", async ({
    page,
  }) => {
    const departure = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    await seedExpiredSnapshot(page, makeFakeRoute(departure));

    await page.goto("/?trip=1", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    await expect(
      page.getByText("Your trip details are no longer available"),
    ).toBeVisible({ timeout: 5000 });
  });

  test("shows stale route banner when departure is in the past", async ({
    page,
  }) => {
    // 15 min ago — past departure but fresh snapshot (within 12h)
    const departure = new Date(Date.now() - 15 * 60_000).toISOString();
    await seedSnapshot(
      page,
      makeFakeRoute(departure),
      makeFakePlannerStops(),
    );

    await page.goto("/?trip=1", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    // Route restores and auto-opens the mobile detail sheet which contains
    // the StaleRouteBanner. The banner also exists inside the desktop sidebar
    // (hidden on mobile via `hidden md:flex`), so use .last() to target the
    // mobile-visible instance.
    const staleBanner = page
      .getByText("This trip has already departed")
      .or(page.getByText("Times may be outdated"))
      .last();
    await expect(staleBanner).toBeVisible({ timeout: 8000 });
  });

  test("back button from restored route returns to map", async ({ page }) => {
    const departure = new Date(Date.now() + 30 * 60_000).toISOString();
    await seedSnapshot(page, makeFakeRoute(departure), makeFakePlannerStops());

    await page.goto("/?trip=1", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    await expect(page.getByPlaceholder("From").last()).toHaveValue(
      "Tallinn Airport",
      { timeout: 8000 },
    );

    await page.goBack();

    // Should return to map — no #directions hash
    await expect(page).not.toHaveURL(/#directions/);
  });
});

// ---------------------------------------------------------------------------
// Warm-start tests: app is already open, notification tapped → SW sends
// postMessage({ type: "trip-reminder" }) → TripBanner appears.
// These need service workers unblocked so navigator.serviceWorker exists.
// ---------------------------------------------------------------------------
test.describe("Trip restore — warm start (SW message)", () => {
  test.use({ serviceWorkers: "allow" });

  test("shows reminder banner on SW postMessage and tapping it restores the route", async ({
    page,
  }) => {
    const departure = new Date(Date.now() + 30 * 60_000).toISOString();
    await seedSnapshot(page, makeFakeRoute(departure), makeFakePlannerStops());

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    // Simulate what the SW does in focusOrOpenAsync when the app is already open:
    // it calls client.postMessage({ type: "trip-reminder", url: "/?trip=1" }).
    // We dispatch a synthetic MessageEvent on navigator.serviceWorker which is
    // where HomeStateEffects registers its listener.
    await page.evaluate(() => {
      navigator.serviceWorker.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "trip-reminder", url: "/?trip=1" },
        }),
      );
    });

    // Reminder banner should appear
    const bannerText = page.getByText("Time to leave");
    await expect(bannerText).toBeVisible({ timeout: 5000 });

    // Tap the banner to restore the trip
    await bannerText.click();

    // Should open directions with the restored route
    await expect(page.getByPlaceholder("From").last()).toHaveValue(
      "Tallinn Airport",
      { timeout: 8000 },
    );
  });

  test("dismiss button closes the reminder banner", async ({ page }) => {
    const departure = new Date(Date.now() + 30 * 60_000).toISOString();
    await seedSnapshot(page, makeFakeRoute(departure));

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    await page.evaluate(() => {
      navigator.serviceWorker.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "trip-reminder", url: "/?trip=1" },
        }),
      );
    });

    const bannerText = page.getByText("Time to leave");
    await expect(bannerText).toBeVisible({ timeout: 5000 });

    // The X button is inside the fixed banner container
    const bannerContainer = page.locator(".fixed").filter({ hasText: "Time to leave" });
    await bannerContainer.locator("button").click();

    await expect(bannerText).not.toBeVisible();
  });
});
