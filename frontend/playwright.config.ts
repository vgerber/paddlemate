import { defineConfig, devices } from "@playwright/test";

// The tests drive the running stack (see the dev-services skill): Postgres,
// Keycloak, the API on :3000 and Vite on :5173, with the test-data fixture
// seeded. They use the system Chrome, so no browser download is needed. Start
// the API with the three rate-limit variables at 0 (the skill has the
// command), or parallel workers hit the limiter.
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

// The routine run and the sweep are two runs of the same projects:
// `npm run e2e` runs everything but e2e/sweep, `npm run e2e:sweep` only that.
const SWEEP = !!process.env.E2E_SWEEP;

// The specs share one seeded database, so a test that creates, changes or
// deletes data is tagged `@write` in its title and runs after every read-only
// test, one worker at a time, one layout after the other. Everything else is
// read-only (page.route mocks are not writes) and runs in parallel. Writers:
//   a11y/view-focus   log form: Next, Back and Save keep focus
//   logs/logs         put-in survives Next and is saved; create and delete a log
//   settings/settings access token is created and revoked
//   trips/trips       a vote is pressed and taken back; edit trip saves
// A new test that writes gets `@write`.
const WRITE = /@write/;

// Whole files that test tokens, storage or logic the layout does not change:
// the phone project runs them, desktop skips them, and small runs only the
// tests inside them tagged @small. Single tests and describes of the same
// kind call `phoneOnly()` from support/fixture.ts instead. The dark specs
// for the map, the map pages and trips stay on desktop.
const PHONE_ONLY = [
  /dark\/(charts|content|flash|helpers|print|recolour|settings|shell|waterway)\.spec/,
  /motion\/switch\.spec/,
  /app-shell\/session\.spec/,
  /batch\/requests\.spec/,
  /settings\/(auth-callback|tokens-error)\.spec/,
];
// Specs that sample frames, long tasks or mid-transition values (and the CPU
// cost specs): they fail when 6 workers compete for the cores, so they run in
// the `*-timing` projects, one worker, after the writers.
const TIMING =
  /(motion\/(frames|panels|feedback)|swipe\/frames|charts\/(motion|range)|map\/(area-region|area-slider-cost|markers|motion)|section-detail\/motion|trips\/motion|wizards\/motion)\.spec/;
const SMALL = /@small/;
const READERS = { grepInvert: WRITE };

// Workers for the read-only tests: 8 was 20% faster than 4 on the phone but
// more timing specs failed; 6 with the timing group apart is the balance.
const WORKERS = Number(process.env.E2E_WORKERS ?? 6);

const layouts = {
  // A phone, the layout most people use.
  phone: { ...devices["Pixel 7"], channel: "chrome" },
  // The smallest phone still in use. Only tests tagged @small run here.
  small: {
    ...devices["iPhone SE"],
    channel: "chrome",
    viewport: { width: 320, height: 568 },
    defaultBrowserType: "chromium",
  },
  // The two-pane layout from the `md` breakpoint up.
  desktop: {
    ...devices["Desktop Chrome"],
    channel: "chrome",
    viewport: { width: 1280, height: 800 },
  },
} as const;

type Layout = keyof typeof layouts;
const names = Object.keys(layouts) as Layout[];

function layoutProject(
  name: Layout,
  kind: "read" | "write" | "timing",
  after: string[],
) {
  const writers = kind === "write";
  const small = name === "small";
  const base = small ? SMALL : undefined;
  return {
    name: kind === "read" ? name : `${name}-${kind}`,
    use: { ...layouts[name], storageState: "e2e/.auth/vincent.json" },
    dependencies: ["setup", ...after],
    testIgnore: SWEEP
      ? undefined
      : [
          /auth\.setup\.ts/,
          /sweep\//,
          ...(kind === "read" || kind === "write" ? [TIMING] : []),
          ...(name === "desktop" ? PHONE_ONLY : []),
        ],
    testMatch: SWEEP
      ? /sweep\/.*\.spec\.ts/
      : kind === "timing"
        ? TIMING
        : undefined,
    // Playwright takes one grep; a lookahead ands the layout and the tag.
    grep: writers ? (small ? /^(?=.*@small)(?=.*@write)/ : WRITE) : base,
    ...(writers ? {} : READERS),
    // Writers share the database with each other, timing specs the CPU: one
    // worker.
    ...(kind === "read" ? {} : { workers: 1 }),
  };
}

const readers = names.map((n) => layoutProject(n, "read", []));
const writers = names.map((n, i) =>
  layoutProject(n, "write", i === 0 ? names : [`${names[i - 1]}-write`]),
);
const timing = names.map((n, i) =>
  layoutProject(
    n,
    "timing",
    i === 0 ? [`${names[names.length - 1]}-write`] : [`${names[i - 1]}-timing`],
  ),
);

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/support/global-setup.ts",
  outputDir: "./test-results",
  workers: WORKERS,
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
    ...readers,
    ...(SWEEP ? [] : [...writers, ...timing]),
  ],
});
