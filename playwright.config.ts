import { defineConfig, devices } from "@playwright/test";

const fixtureMode = process.env.COURTLISTENER_E2E_FIXTURE === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: fixtureMode ? 10_000 : 90_000 },
  reporter: [["list"], ["html", { outputFolder: "artifacts/playwright-report", open: "never" }]],
  use: {
    baseURL: process.env.COURTLISTENER_REVIEW_URL || (fixtureMode ? "http://127.0.0.1:8891" : "http://127.0.0.1:8890"),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1500, height: 1050 },
  },
  outputDir: "artifacts/playwright",
  webServer: fixtureMode ? {
    command: "npm run fixture:server",
    url: "http://127.0.0.1:8891/healthz",
    timeout: 30_000,
    reuseExistingServer: false,
    env: {
      COURTLISTENER_FIXTURE_PASSWORD: process.env.COURTLISTENER_FIXTURE_PASSWORD || "Fixture review credential! 42",
    },
  } : undefined,
});
