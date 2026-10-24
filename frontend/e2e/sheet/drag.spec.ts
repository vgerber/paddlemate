import { expect, type Page, test } from "@playwright/test";
import { mockRegions } from "../map/regions.mock";
import { Finger } from "../support/finger";
import { appReady } from "../support/fixture";

// The phone search sheet moves by a vertical drag from anywhere on it, the way
// a map app's sheet does: header always, content when it is at its top and the
// drag goes down or when the sheet can still rise. Sideways is the tab swipe.

test.use({ hasTouch: true });
test.skip(({ isMobile }) => !isMobile, "the sheet is the phone's");

const sheet = (page: Page) => page.getByRole("region", { name: "Search" });
const openSheet = (page: Page) => page.getByRole("dialog", { name: "Search" });
const top = async (page: Page) =>
  (
    await page
      .locator(
        '[aria-label="Search"][role="region"], [aria-label="Search"][role="dialog"]',
      )
      .boundingBox()
  )?.y ?? 0;

/** The sheet's scrolling list, given enough rows to scroll. */
async function fillList(page: Page) {
  await page
    .locator('[aria-label="Search"][role="region"]')
    .evaluate((root) => {
      const list = [...root.querySelectorAll<HTMLElement>("*")].find((e) => {
        const o = getComputedStyle(e).overflowY;
        return o === "auto" || o === "scroll";
      });
      if (!list) throw new Error("no scrolling list in the sheet");
      list.dataset.testid = "sheet-list";
      const filler = document.createElement("div");
      filler.style.height = "2400px";
      filler.textContent = "rows";
      list.append(filler);
    });
  return page.getByTestId("sheet-list");
}

async function start(page: Page) {
  await mockRegions(page);
  await page.goto("/?mode=area");
  await appReady(page);
  await expect(sheet(page)).toBeVisible();
  return fillList(page);
}

async function drag(page: Page, x: number, y: number, dx: number, dy: number) {
  const finger = await Finger.down(page, x, y);
  await finger.moveBy(dx, dy);
  await finger.up();
}

test.describe("dragging the search sheet from anywhere", () => {
  test("@small a drag up from the middle of the list moves the sheet up", async ({
    page,
  }) => {
    const list = await start(page);
    const before = await top(page);
    const box = await list.boundingBox();
    if (!box) throw new Error("no list");
    await drag(page, box.x + box.width / 2, box.y + 120, 0, -480);
    await expect(openSheet(page)).toBeVisible();
    expect(await top(page)).toBeLessThan(before - 150);
    expect(await list.evaluate((e) => e.scrollTop)).toBe(0);
  });

  test("at the top stop a drag up scrolls the list", async ({ page }) => {
    const list = await start(page);
    await sheet(page).getByRole("button", { name: "Expand panel" }).click();
    await expect(openSheet(page)).toBeVisible();
    await page.waitForTimeout(400);
    const rest = await top(page);
    const box = await list.boundingBox();
    if (!box) throw new Error("no list");
    await drag(page, box.x + box.width / 2, box.y + 300, 0, -150);
    expect(await list.evaluate((e) => e.scrollTop)).toBeGreaterThan(50);
    expect(await top(page)).toBe(rest);
  });

  test("@small a scrolled list scrolls back first, then the drag moves the sheet", async ({
    page,
  }) => {
    const list = await start(page);
    await sheet(page).getByRole("button", { name: "Expand panel" }).click();
    await expect(openSheet(page)).toBeVisible();
    await page.waitForTimeout(400);
    const rest = await top(page);
    await list.evaluate((e) => {
      e.scrollTop = 400;
    });
    const box = await list.boundingBox();
    if (!box) throw new Error("no list");
    const x = box.x + box.width / 2;
    await drag(page, x, box.y + 200, 0, 100);
    expect(await list.evaluate((e) => e.scrollTop)).toBeLessThan(400);
    expect(await top(page)).toBe(rest);

    await list.evaluate((e) => {
      e.scrollTop = 0;
    });
    await drag(page, x, box.y + 100, 0, 300);
    await expect(sheet(page)).toBeVisible();
    expect(await top(page)).toBeGreaterThan(rest + 100);
  });

  test("a drag on the header moves the sheet and a tap still lands", async ({
    page,
  }) => {
    await start(page);
    const before = await top(page);
    const tab = page.getByRole("tab", { name: "Region", exact: true });
    const box = await tab.boundingBox();
    if (!box) throw new Error("no tab");
    await drag(page, box.x + box.width / 2, box.y + box.height / 2, 0, -480);
    await expect(openSheet(page)).toBeVisible();
    expect(await top(page)).toBeLessThan(before - 150);
    // The drag did not click the tab it started on.
    await expect(page).toHaveURL(/mode=area/);
  });

  test("a sideways swipe still changes the tab and leaves the sheet", async ({
    page,
  }) => {
    const list = await start(page);
    const box = await list.boundingBox();
    if (!box) throw new Error("no list");
    await drag(page, box.x + box.width - 40, box.y + 100, -220, 6);
    await expect(page).toHaveURL(/mode=region/);
    // Still resting as a peek: a swipe is not a pull.
    await expect(sheet(page)).toBeVisible();
  });

  test("the handle still opens and closes the sheet by keyboard", async ({
    page,
  }) => {
    await start(page);
    const handle = sheet(page).getByRole("button", { name: "Expand panel" });
    await handle.focus();
    await page.keyboard.press("Enter");
    await expect(openSheet(page)).toBeVisible();
    await openSheet(page)
      .getByRole("button", { name: "Shrink panel" })
      .press("Space");
    await expect(sheet(page)).toBeVisible();
  });
});
