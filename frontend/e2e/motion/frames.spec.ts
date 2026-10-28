import { expect, type Page, test } from "@playwright/test";
import { mockRegions } from "../map/regions.mock";
import { appReady, gotoSection } from "../support/fixture";

// Frame budget: opening the phone panel and folding
// the features card cause no long task. A long task is main-thread work over
// 50 ms, the line the browser itself calls janky.

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;
/** The budget is 50 ms, but software-rendered WebGL in headless Chrome draws
 * the map in tasks of 70-180 ms, the same with Reduced motion, so the
 * animations are not their cause. This bound is a regression net, not the
 * budget (see Known limits in doc/design.md). */
const LONG_TASK_MS = 300;

async function watchLongTasks(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __long: number[] };
    w.__long = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__long.push(e.duration);
    }).observe({ type: "longtask", buffered: false });
  });
}

const longTasks = (page: Page) =>
  page.evaluate(() => (window as unknown as { __long: number[] }).__long);

test("opening the phone panel causes no long task", async ({ page }) => {
  test.skip(!isPhone(page), "the phone panel");
  await mockRegions(page);
  await page.goto("/");
  await appReady(page);
  await page.getByRole("button", { name: "Open search panel" }).click();
  const row = page
    .getByTestId("overlay-content")
    .getByText("Test River")
    .first();
  await expect(row).toBeVisible();
  await watchLongTasks(page);
  await row.click();
  await expect(page.getByTestId("overlay-content")).toBeVisible();
  await page.waitForTimeout(1200);
  const tasks = await longTasks(page);
  expect(Math.max(0, ...tasks)).toBeLessThanOrEqual(LONG_TASK_MS);
});

test("folding the features card causes no long task", async ({ page }) => {
  await gotoSection(page, "lower");
  const card = page.getByTestId("features-card").filter({ visible: true });
  await expect(card).toBeVisible();
  const head = card
    .locator('[data-band="range"]')
    .first()
    .locator("[data-row]")
    .first();
  await watchLongTasks(page);
  await head.click();
  await expect(
    card.locator('[data-band="range"] > [data-fold]').first(),
  ).toHaveAttribute("data-fold", "shut");
  await page.waitForTimeout(800);
  await head.click();
  await page.waitForTimeout(800);
  const tasks = await longTasks(page);
  expect(Math.max(0, ...tasks)).toBeLessThanOrEqual(LONG_TASK_MS);
});
