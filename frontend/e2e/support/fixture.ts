import { expect, type Locator, type Page, test } from "@playwright/test";

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

/** Call at file or describe level: the tests there are layout independent
 * (tokens, storage, logic) and run on the phone project only. */
export function phoneOnly(reason = "layout independent: the phone covers it") {
  test.beforeEach(({ browserName: _browser }, info) => {
    test.skip(info.project.name !== "phone", reason);
  });
}

/** The trip plan's week strip opens on today's week (3ee008c). Scrolling the
 * plan makes the first day current, so the strip shows the selected disc and
 * the logged runs however long ago the fixture was seeded. */
export async function selectFirstPlanDay(page: Page) {
  await page
    .getByTestId("plan-scroll")
    .filter({ visible: true })
    .evaluate((el) => {
      el.scrollTop = 2;
      el.dispatchEvent(new Event("scroll"));
    });
  await expect(
    page
      .getByTestId("week-strip")
      .filter({ visible: true })
      .getByTestId("current-disc"),
  ).toHaveCount(1);
  // The week swaps from today's week; wait for the leaving pane to go.
  await expect(page.getByTestId("week-pane")).toHaveCount(1);
}
