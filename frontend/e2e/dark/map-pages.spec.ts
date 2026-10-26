import { expect, type Page, test } from "@playwright/test";
import { contrastReport, lightSurfaces, useScheme } from "../support/dark";

// Map-page and logs screens in dark (doc/design.md#dark-mode).
type Shot = {
  name: string;
  path: string;
  ready: RegExp;
  open?: (page: Page) => Promise<void>;
};

const SHOTS: Shot[] = [
  { name: "map", path: "/", ready: /\w/ },
  { name: "search panel", path: "/?panel=1&q=Test", ready: /Test/ },
  { name: "river", path: "/?waterway=9001", ready: /Lower Test/ },
  {
    name: "river gauges",
    path: "/?waterway=9001",
    ready: /Test River/,
    open: async (p) => {
      await p.getByRole("tab", { name: "Gauges", exact: true }).click();
    },
  },
  {
    name: "section",
    path: "/?waterway=9001&section=9102",
    ready: /Lower Test/,
  },
  {
    name: "section sources",
    path: "/?waterway=9001&section=9102",
    ready: /Lower Test/,
    open: async (p) => {
      await p.getByRole("tab", { name: "Sources", exact: true }).click();
    },
  },
  { name: "logs", path: "/logs", ready: /Test/ },
  { name: "log detail", path: "/logs/9201", ready: /Public multi-section/ },
  {
    name: "social",
    path: "/logs",
    ready: /Test/,
    open: async (p) => {
      await p.getByRole("tab", { name: "Social", exact: true }).click();
    },
  },
];

// The rejected fold draws a dimmed separator rule on purpose.
const OTHERS = /"(Hide|Show) rejected/;

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
}

test.describe("map pages in dark", () => {
  for (const s of SHOTS) {
    test(s.name, async ({ page }) => {
      await useScheme(page, "system", "dark");
      await page.goto(s.path);
      await expect(page.locator("body")).toContainText(s.ready);
      await s.open?.(page);
      await page.waitForTimeout(1500);
      await settle(page);
      const mine = (f: { what: string }) => !OTHERS.test(f.what);
      expect(
        (await lightSurfaces(page)).filter(mine),
        "light surfaces",
      ).toEqual([]);
      expect((await contrastReport(page)).filter(mine), "contrast").toEqual([]);
      const over = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(over, "sideways scroll").toBeLessThanOrEqual(0);
    });
  }
});
