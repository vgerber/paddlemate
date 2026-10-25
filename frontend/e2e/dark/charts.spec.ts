import { expect, type Page, test } from "@playwright/test";
import { mockSummary } from "../charts/summary.mock";
import { contrastReport, lightSurfaces, useScheme } from "../support/dark";
import { appReady } from "../support/fixture";

// Charts, level chips and dots, section details and the gauge panel in a dark
// device scheme (doc/design.md#dark-mode).

const SECTION = "/?waterway=9001&section=9102";
const LONG = "/?waterway=9002&section=9111";

async function clean(page: Page) {
  expect(await lightSurfaces(page), "light surfaces").toEqual([]);
  expect(await contrastReport(page), "contrast violations").toEqual([]);
  expect(await svgTextContrast(page), "svg text contrast").toEqual([]);
}

/** SVG text is outside `contrastReport`: measure its fill against the first
 * opaque background above it. */
async function svgTextContrast(page: Page) {
  return page.evaluate(() => {
    const rgb = (c: string) => {
      const m = c.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
      return { c: m.slice(0, 3), a: m[3] ?? 1 };
    };
    const lum = (c: number[]) => {
      const [r, g, b] = c.map((v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const out: string[] = [];
    for (const el of document.querySelectorAll("svg text")) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || !(el.textContent ?? "").trim()) continue;
      const fill = rgb(getComputedStyle(el).fill);
      let ground = [255, 255, 255];
      for (let n: Element | null = el; n; n = n.parentElement) {
        const b = rgb(getComputedStyle(n).backgroundColor);
        if (b.a > 0.9) {
          ground = b.c;
          break;
        }
      }
      const [hi, lo] = [lum(fill.c), lum(ground)].sort((a, b) => b - a);
      const ratio = (hi + 0.05) / (lo + 0.05);
      if (ratio < 4.5) out.push(`${el.textContent} ${ratio.toFixed(2)}`);
    }
    return out;
  });
}

async function chartDrawn(page: Page) {
  await expect(
    page.locator('[data-testid="chart-plot"]:visible').first(),
  ).toBeVisible();
  await expect(
    page.locator("svg.recharts-surface:visible").first(),
  ).toBeVisible();
}

test.describe("dark charts and levels @small", () => {
  test.beforeEach(async ({ page }) => {
    await useScheme(page, "system", "dark");
  });

  test("section features: no light surface, readable", async ({ page }) => {
    await page.goto(SECTION);
    await appReady(page);
    await chartDrawn(page);
    await clean(page);
  });

  test("river and its gauge tab", async ({ page }) => {
    await page.goto("/?waterway=9001");
    await appReady(page);
    await clean(page);
    await page.getByRole("tab", { name: "Gauges", exact: true }).click();
    await clean(page);
  });

  test("low-high band and custom range dialog", async ({ page }) => {
    await mockSummary(page);
    await page.goto(LONG);
    await appReady(page);
    await chartDrawn(page);
    await clean(page);
    await page
      .locator('button[aria-label="Chart period"]:visible')
      .first()
      .click();
    await page.getByRole("menuitem", { name: "Custom range…" }).click();
    await expect(
      page.getByRole("dialog", { name: "Custom range" }),
    ).toBeVisible();
    await clean(page);
  });
});
