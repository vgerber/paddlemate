import { expect, type Locator, type Page } from "@playwright/test";

/** Ids from the test-data fixture (.claude/skills/test-data/seed.sql). */
export const FIX = {
  waterway: 9001,
  sections: {
    upper: 9101,
    lower: 9102,
    empty: 9103,
    low: 9104,
    high: 9105,
    dry: 9106,
    silent: 9107,
  },
  gauge: 9301,
  trips: [9001, 9002],
} as const;

/** The app is ready when the map has drawn. The page never reaches network
 * idle (it keeps connections open), so wait for something visible instead. */
export async function appReady(page: Page) {
  await page.waitForLoadState("load");
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
}

/** The map page with a section open, the way the app links to it. */
export async function gotoSection(page: Page, key: keyof typeof FIX.sections) {
  await page.goto(`/?waterway=${FIX.waterway}&section=${FIX.sections[key]}`);
  await appReady(page);
}

/** The page must never scroll sideways: that is how a layout breaks first on
 * a small phone. */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(0);
}

/** Every match is at least `min` px in both directions: a finger has to hit
 * it. The visual size may be smaller when a larger hit area is drawn around
 * it, so this measures the element that takes the tap. */
export async function expectTouchTargets(locator: Locator, min = 44) {
  const boxes = await locator.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        label: (el.getAttribute("aria-label") || el.textContent || el.tagName)
          .trim()
          .slice(0, 40),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    }),
  );
  const small = boxes.filter((b) => b.w < min || b.h < min);
  expect(small, `targets under ${min}px`).toEqual([]);
}

/** Computed style of the first match, for token checks. */
export async function computed(locator: Locator, property: string) {
  return locator
    .first()
    .evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), property);
}
