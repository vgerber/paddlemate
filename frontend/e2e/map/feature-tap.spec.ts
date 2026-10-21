import { expect, type Page, test } from "@playwright/test";
import { appReady, FIX } from "../support/fixture";

// A tap on a feature on the map opens that feature, like its row does, and
// leaves the section open. Fixture: Lower Test (9102), features 9521-9529.

const LOWER = `/?waterway=${FIX.waterway}&section=${FIX.sections.lower}`;
const PUT_IN = { id: 9521, at: [11.01, 47.01] as [number, number] };
const HOLE = { id: 9525, at: [11.013, 47.013] as [number, number] };
const RAPID_LINE = { id: 9524, at: [11.0125, 47.0125] as [number, number] };
const PORTAGE_LINE = {
  id: 9528,
  at: [11.0165, 47.0165] as [number, number],
};

type MapLike = {
  isMoving(): boolean;
  loaded(): boolean;
  project(lngLat: [number, number]): { x: number; y: number };
  getLayer(id: string): unknown;
};

async function openMap(page: Page, url = LOWER) {
  await page.goto(url);
  await appReady(page);
  await page.waitForFunction(() => {
    const map = (window as unknown as { __paddlemateMap?: MapLike })
      .__paddlemateMap;
    return !!map && map.loaded() && !map.isMoving();
  });
}

/** The phone hides the map under the detail overlay; show it. */
async function showMap(page: Page, isMobile: boolean) {
  if (!isMobile) return;
  const view = page.getByRole("button", { name: "View on map" });
  if (await view.isVisible()) await view.click();
  await expect(page.getByTestId("mobile-overlay")).toBeHidden();
}

async function settle(page: Page) {
  await page.waitForFunction(() => {
    const map = (window as unknown as { __paddlemateMap?: MapLike })
      .__paddlemateMap;
    return !!map && !map.isMoving();
  });
}

/** Screen position of a coordinate on the page. */
async function screenOf(page: Page, at: [number, number]) {
  const canvas = await page.locator("canvas.maplibregl-canvas").boundingBox();
  if (!canvas) throw new Error("no canvas");
  const p = await page.evaluate((lngLat) => {
    const map = (window as unknown as { __paddlemateMap: MapLike })
      .__paddlemateMap;
    return map.project(lngLat);
  }, at);
  return { x: canvas.x + p.x, y: canvas.y + p.y };
}

async function tapAt(page: Page, at: [number, number], isMobile: boolean) {
  await settle(page);
  const { x, y } = await screenOf(page, at);
  if (isMobile) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function zoomTo(page: Page, at: [number, number]) {
  await page.evaluate((center) => {
    const map = (
      window as unknown as {
        __paddlemateMap: { jumpTo(o: object): void };
      }
    ).__paddlemateMap;
    map.jumpTo({ center, zoom: 17 });
  }, at);
  await settle(page);
}

function search(page: Page) {
  return new URL(page.url()).searchParams;
}

/** The hole's own row; a range row also reads expanded while it holds the
 * open feature. */
const holeRow = (page: Page) =>
  page.locator('[data-row][data-type="hole"][aria-expanded="true"]');

test.describe("tapping a feature on the map", () => {
  for (const [name, feature] of [
    ["a point", HOLE],
    ["a put-in on the section's end", PUT_IN],
    ["a line", RAPID_LINE],
    ["a line's far end", PORTAGE_LINE],
  ] as const) {
    test(`opens ${name} and keeps the section @small`, async ({
      page,
      isMobile,
    }) => {
      await openMap(page);
      await showMap(page, isMobile);
      // Close in, so a line is clear of the points beside it.
      await zoomTo(page, feature.at);
      await tapAt(page, feature.at, isMobile);
      await expect
        .poll(() => search(page).get("feature"))
        .toBe(String(feature.id));
      expect(search(page).get("section")).toBe(String(FIX.sections.lower));
      expect(search(page).get("waterway")).toBe(String(FIX.waterway));
    });
  }

  test("the feature wins over a line under it, the point over a pin @small", async ({
    page,
    isMobile,
  }) => {
    // The hole sits on the midpoint of the rapid line, where its pin is.
    await openMap(page);
    await showMap(page, isMobile);
    await tapAt(page, HOLE.at, isMobile);
    await expect.poll(() => search(page).get("feature")).toBe(String(HOLE.id));
  });

  test("a second tap closes the feature, the section stays @small", async ({
    page,
    isMobile,
  }) => {
    await openMap(page);
    await showMap(page, isMobile);
    await tapAt(page, HOLE.at, isMobile);
    await expect.poll(() => search(page).get("feature")).toBe(String(HOLE.id));
    await tapAt(page, HOLE.at, isMobile);
    await expect.poll(() => search(page).get("feature")).toBeNull();
    expect(search(page).get("section")).toBe(String(FIX.sections.lower));
  });

  test("a line is drawn heavier along its course", async ({
    page,
    isMobile,
  }) => {
    await openMap(page, `${LOWER}&feature=${RAPID_LINE.id}`);
    await showMap(page, isMobile);
    const drawn = await page.evaluate(
      () =>
        !!(
          window as unknown as { __paddlemateMap: MapLike }
        ).__paddlemateMap.getLayer("feature-lines-selected"),
    );
    expect(drawn).toBe(true);
  });

  test("the feature stays open after a reload", async ({ page }) => {
    await openMap(page, `${LOWER}&feature=${HOLE.id}`);
    await expect(holeRow(page)).toHaveCount(1);
    expect(search(page).get("feature")).toBe(String(HOLE.id));
  });

  test("area mode still moves the circle, no feature opens", async ({
    page,
  }) => {
    await page.goto("/?mode=area&lat=47.01&lon=11.01&radius=20");
    await appReady(page);
    await tapAt(page, HOLE.at, false);
    await expect.poll(() => search(page).get("lat")).not.toBe("47.01");
    expect(search(page).get("feature")).toBeNull();
  });
});

test.describe("opening a feature from the list", () => {
  test("a phone keeps the list and names the feature on the map", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "phone layout");
    await openMap(page);
    await page.locator("[data-row]").filter({ hasText: "Big Hole" }).click();
    await expect(holeRow(page)).toHaveCount(1);
    await expect(page.getByTestId("mobile-overlay")).toBeVisible();
    await showMap(page, true);
    const bar = page.getByRole("button", { name: /Big Hole/ });
    await expect(bar).toBeVisible();
    await expect(bar).toContainText("Lower Test");
    expect(search(page).get("feature")).toBe(String(HOLE.id));
  });

  test("a desktop frames it in the free area, not the whole window", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "desktop layout");
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMap(page);
    await page.locator("[data-row]").filter({ hasText: "Big Hole" }).click();
    await settle(page);
    const raw = await page.getByTestId("canvas-host").getAttribute("data-free");
    const [fx, fy, fw, fh] = (raw ?? "").split(",").map(Number);
    const at = await screenOf(page, HOLE.at);
    const host = await page.getByTestId("canvas-host").boundingBox();
    const cx = fx + fw / 2 + (host?.x ?? 0);
    const cy = fy + fh / 2 + (host?.y ?? 0);
    expect(Math.abs(at.x - cx)).toBeLessThan(40);
    expect(Math.abs(at.y - cy)).toBeLessThan(40);
  });

  test("closing the row clears the feature @small", async ({ page }) => {
    await openMap(page, `${LOWER}&feature=${HOLE.id}`);
    await holeRow(page).click();
    await expect.poll(() => search(page).get("feature")).toBeNull();
    await expect(holeRow(page)).toHaveCount(0);
  });
});

test("the speed dial leaves the last row's km readable @small", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "phone layout");
  await openMap(page);
  const last = page.locator("[data-row]").last();
  // Scroll the list to its very end, as a thumb would.
  await last.evaluate((el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      if (n.scrollHeight > n.clientHeight + 1) n.scrollTop = n.scrollHeight;
    }
  });
  await page.waitForTimeout(300);
  const km = last.getByText(/km$/).last();
  const fab = page
    .getByTestId("mobile-overlay")
    .getByRole("button", { name: /new|add|suggest|feature/i })
    .last();
  const a = await km.boundingBox();
  const b = await fab.boundingBox();
  if (!a || !b) throw new Error("no boxes");
  const overlap =
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height;
  expect(overlap, "the FAB covers the last row's km").toBe(false);
});
