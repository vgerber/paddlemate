import { expect, type Page, test } from "@playwright/test";
import { expectNoHorizontalOverflow } from "../support/fixture";

// The wiki list scrolls its models only: the window, the header, the trail,
// the sidebar and the search row stay where they are. Read-only.

const top = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => el.getBoundingClientRect().top);

const scroller = (page: Page) =>
  page.getByTestId("wiki-scroll").filter({ visible: true });

async function scrollModels(page: Page) {
  const box = scroller(page);
  await expect(page.getByTestId("material-row").first()).toBeVisible();
  const moved = await box.evaluate((el) => {
    el.scrollTop = 400;
    return { top: el.scrollTop, room: el.scrollHeight - el.clientHeight };
  });
  expect(moved.room).toBeGreaterThan(0);
  expect(moved.top).toBeGreaterThan(0);
}

test.describe("wiki list scroll on a desktop", () => {
  test.beforeEach(({ page: _page }, info) => {
    test.skip(!info.project.name.startsWith("desktop"), "desktop layout");
  });

  test("scrolling the models leaves header, trail and sidebar in place", async ({
    page,
  }) => {
    await page.goto("/materials");
    await expect(page.getByTestId("material-row").first()).toBeVisible();
    const sel = [
      '[data-testid="wiki-header"]',
      'nav[aria-label="Breadcrumb"]',
      '[data-column="wiki-sidebar"]',
    ];
    const before = await Promise.all(sel.map((s) => top(page, s)));
    await scrollModels(page);
    expect(await Promise.all(sel.map((s) => top(page, s)))).toEqual(before);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const doc = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    expect(doc).toBeLessThanOrEqual(0);
  });

  test("the sidebar scrolls on its own when its content is taller", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 480 });
    await page.goto("/materials");
    const side = page.locator('[data-column="wiki-sidebar"]');
    await expect(side).toBeVisible();
    const box = await side.boundingBox();
    expect(box?.height ?? 0).toBeLessThanOrEqual(480);
    const inner = await side.evaluate((el) => {
      const s = [...el.querySelectorAll("div")].find(
        (d) =>
          getComputedStyle(d).overflowY === "auto" &&
          d.scrollHeight > d.clientHeight,
      );
      if (!s) return null;
      s.scrollTop = 100;
      return s.scrollTop;
    });
    expect(inner).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
});

test.describe("wiki list scroll on a phone", () => {
  test.beforeEach(({ page: _page }, info) => {
    test.skip(info.project.name.startsWith("desktop"), "phone layout");
  });

  test("the search row stays while the list scrolls @small", async ({
    page,
  }) => {
    await page.goto("/materials");
    const search = page.getByLabel("Brand or model").filter({ visible: true });
    await expect(page.getByTestId("material-row").first()).toBeVisible();
    const before = await search.evaluate(
      (el) => el.getBoundingClientRect().top,
    );
    await scrollModels(page);
    const after = await search.evaluate((el) => el.getBoundingClientRect().top);
    expect(after).toBe(before);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expectNoHorizontalOverflow(page);
  });
});
