import { expect, test } from "@playwright/test";
import {
  expectContrast,
  lightSurfaces,
  noLightSurface,
  useScheme,
} from "../support/dark";

// The shell in dark: app bar, bottom nav, canvas cards, states, tools, dev
// routes and the sign-in gate (doc/design.md#dark-mode).

// The legend swatch on the gauge map is a data colour: the surface check
// skips that one element, not the page.
const LEGEND_SWATCH = /^div\.MuiBox-root\.css-\w+$/;
const LEGEND_GREEN = "background rgba(134, 210, 178, 1)";
const SIGNED_IN: {
  name: string;
  path: string;
  ready: RegExp;
}[] = [
  { name: "tools", path: "/tools", ready: /Tools|Gauge/i },
  {
    name: "gauge-catalog",
    path: "/tools/gauge-catalog",
    ready: /Gauge/i,
  },
  { name: "dev-canvas", path: "/dev/canvas", ready: /\w/ },
  {
    name: "dev-primitives",
    path: "/dev/primitives",
    ready: /\w/,
  },
  {
    name: "missing",
    path: "/?waterway=999999",
    ready: /\w/,
  },
  { name: "trips", path: "/trips", ready: /Oetztal/ },
];

async function settle(page: import("@playwright/test").Page) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
}

async function noSideways(page: import("@playwright/test").Page) {
  const over = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(over, "sideways scroll").toBeLessThanOrEqual(0);
}

test.describe("shell in dark", () => {
  for (const s of SIGNED_IN) {
    test(`${s.name} never scrolls sideways @small`, async ({ page }) => {
      await useScheme(page, "system", "dark");
      await page.goto(s.path);
      await expect(page.locator("body")).toContainText(s.ready);
      await settle(page);
      await noSideways(page);
    });
  }

  for (const s of SIGNED_IN) {
    test(s.name, async ({ page }) => {
      await useScheme(page, "system", "dark");
      await page.goto(s.path);
      await expect(page.locator("body")).toContainText(s.ready);
      await page.waitForTimeout(1000);
      await settle(page);
      const light = (await lightSurfaces(page)).filter(
        (f) => !(LEGEND_SWATCH.test(f.what) && f.detail === LEGEND_GREEN),
      );
      expect(light, "light surfaces on the screen").toEqual([]);
      await expectContrast(page);
    });
  }

  test("signed-out gate", async ({ browser }, info) => {
    const ctx = await browser.newContext({
      ...info.project.use,
      storageState: { cookies: [], origins: [] },
    });
    const page = await ctx.newPage();
    await useScheme(page, "system", "dark");
    await page.goto("/logs");
    await expect(page.getByText(/Sign in to view your logs/)).toBeVisible();
    await settle(page);
    await noLightSurface(page);
    await expectContrast(page);
    await noSideways(page);
    await ctx.close();
  });

  test("app bar logo is the dark mark, the light one in light", async ({
    page,
  }) => {
    await useScheme(page, "system", "dark");
    await page.goto("/");
    await expect(
      page.locator('img[src="/logo-dark.svg"]').first(),
    ).toBeAttached();
    await expect(page.locator('img[src="/logo.svg"]')).toHaveCount(0);
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator('img[src="/logo.svg"]').first()).toBeAttached();
  });
});
