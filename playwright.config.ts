import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  fullyParallel: true,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "Mobile Chromium",
      testDir: "./tests/e2e/mobile",
      use: {
        ...devices["Pixel 7"],
      },
    },
    // {
    //   name: "Desktop Chromium",
    //   testDir: "./tests/e2e/desktop",
    //   use: {
    //     ...devices["Desktop Chrome"],
    //     viewport: { width: 1440, height: 900 },
    //   },
    // },
  ],
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
