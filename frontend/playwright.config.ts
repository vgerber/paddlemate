import { defineConfig, devices } from "@playwright/test";

// The tests drive the running stack (see the dev-services skill): Postgres,
// Keycloak, the API on :3000 and Vite on :5173, with the test-data fixture
// seeded. They use the system Chrome, so no browser download is needed.
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/support/global-setup.ts",
  outputDir: "./test-results",
  // One worker: the specs share one seeded database, and a spec may change it.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL: BASE_URL,
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      // A phone, the layout most people use.
      name: "phone",
      use: {
        ...devices["Pixel 7"],
        channel: "chrome",
        storageState: "e2e/.auth/vincent.json",
      },
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
    },
    {
      // The smallest phone still in use. Only specs tagged @small run here.
      name: "small",
      use: {
        ...devices["iPhone SE"],
        channel: "chrome",
        viewport: { width: 320, height: 568 },
        defaultBrowserType: "chromium",
        storageState: "e2e/.auth/vincent.json",
      },
      dependencies: ["setup"],
      grep: /@small/,
      testIgnore: /auth\.setup\.ts/,
    },
    {
      // The two-pane layout from the `md` breakpoint up.
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        viewport: { width: 1280, height: 800 },
        storageState: "e2e/.auth/vincent.json",
      },
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
});
