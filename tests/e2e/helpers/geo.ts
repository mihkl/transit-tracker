import type { BrowserContext } from "@playwright/test";

const TALLINN_CENTER = { latitude: 59.437, longitude: 24.7536 };

export async function grantGeolocation(
  context: BrowserContext,
  coords = TALLINN_CENTER,
) {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation(coords);
}

export async function denyGeolocation(context: BrowserContext) {
  await context.clearPermissions();
}
