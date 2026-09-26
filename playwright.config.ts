import { defineConfig, devices } from "@playwright/test";

const readOnlyDesktopTests = [
  /access-visibility\.spec\.ts/,
  /feed-layout\.spec\.ts/,
  /loading-continuity\.spec\.ts/,
  /motion-system\.spec\.ts/,
  /primary-navigation\.spec\.ts/,
  /record-surfaces\.spec\.ts/,
];

const configuredWorkers = Number.parseInt(process.env.NOVAE_E2E_WORKERS ?? "", 10);
const workers = Number.isFinite(configuredWorkers) && configuredWorkers > 0
  ? configuredWorkers
  : 4;

// Run the focused presentation regressions on another installed engine without
// changing the default CI browser requirements or repeating stateful tests.
const surfaceBrowser = process.env.NOVAE_E2E_SURFACE_BROWSER;
if (surfaceBrowser && !["chromium", "firefox", "webkit"].includes(surfaceBrowser)) {
  throw new Error("NOVAE_E2E_SURFACE_BROWSER must be chromium, firefox or webkit.");
}

export default defineConfig({
  expect: {
    // Protected routes can spend a few seconds in the real session/bootstrap
    // path when the integration suite runs several browsers at once. Individual
    // UI assertions should start after that work rather than racing a 10s cap.
    timeout: 30_000,
  },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  outputDir: "test-results/e2e",
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : [["list"]],
  retries: process.env.CI ? 1 : 0,
  testDir: "./tests/e2e",
  timeout: 90_000,
  use: {
    baseURL: process.env.NOVAE_E2E_BASE_URL ?? "http://127.0.0.1:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  // Read-only journeys can fan out. Tests that mutate shared accounts, access
  // scopes, categories, feature switches, or platform settings stay serialized
  // in the stateful project below.
  workers,
  projects: [
    {
      name: "bootstrap",
      testMatch: /bootstrap\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
      workers: 1,
    },
    ...(surfaceBrowser ? [{
      name: `surfaces-${surfaceBrowser}`,
      dependencies: ["bootstrap"],
      testMatch: /(?:record-surfaces|composer-drafts|feed-and-discussion-state|realtime-sharing)\.spec\.ts/,
      use: { browserName: surfaceBrowser as "chromium" | "firefox" | "webkit" },
    }] : [{
      dependencies: ["bootstrap"],
      name: "chromium-desktop-readonly",
      testMatch: readOnlyDesktopTests,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      dependencies: ["bootstrap"],
      name: "chromium-mobile-readonly",
      testMatch: /mobile-access\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
    {
      // New desktop specs intentionally default to this serialized bucket until
      // they are reviewed and explicitly promoted to the read-only list above.
      dependencies: ["chromium-desktop-readonly", "chromium-mobile-readonly"],
      name: "chromium-stateful",
      testIgnore: [
        /bootstrap\.setup\.ts/,
        /mobile-access\.spec\.ts/,
        ...readOnlyDesktopTests,
      ],
      use: { ...devices["Desktop Chrome"] },
      workers: 1,
    }]),
  ],
});
