import { expect, type Page, test } from "@playwright/test";
import { appReady, FIX } from "../support/fixture";

// WP16b: the map page (/) on the shared canvas. From md the detail card floats
// over the one full-window map, the chart docks along its foot from 1280, and
// the selected section is kept inside the free area. The phone is unchanged.

/** Corners of the "Upper Test" section line (seed.sql). */
const SW: [number, number] = [11.0, 47.0];
const NE: [number, number] = [11.01, 47.01];

type MapLike = {
  isMoving(): boolean;
  loaded(): boolean;
  project(lngLat: [number, number]): { x: number; y: number };
};

const section = `/?waterway=${FIX.waterway}&section=${FIX.sections.upper}`;
const card = (page: Page) => page.getByTestId("canvas-card-detail");

async function open(
  page: Page,
  size: { width: number; height: number },
  url = section,
) {
  await page.setViewportSize(size);
  await page.goto(url);
  await appReady(page);
  await expect(page.getByTestId("canvas-host")).toBeVisible();
  await page.waitForFunction(() => {
    const map = (window as unknown as { __paddlemateMap?: MapLike })
      .__paddlemateMap;
    return !!map && map.loaded() && !map.isMoving();
  });
}

async function box(locator: ReturnType<Page["locator"]>) {
  const b = await locator.boundingBox();
  if (!b) throw new Error("no box");
  return b;
}

async function expectSectionInFreeArea(page: Page) {
  await expect
    .poll(
      async () => {
        const raw = await page
          .getByTestId("canvas-host")
          .getAttribute("data-free");
        const [x, y, w, h] = (raw ?? "").split(",").map(Number);
        const pts = await page.evaluate(
          ([sw, ne]) => {
            const map = (window as unknown as { __paddlemateMap?: MapLike })
              .__paddlemateMap;
            if (!map || map.isMoving()) return null;
            return { sw: map.project(sw), ne: map.project(ne) };
          },
          [SW, NE] as const,
        );
        if (!pts) return "moving";
        const slack = 2;
        const inside =
          pts.sw.x >= x - slack &&
          pts.ne.x <= x + w + slack &&
          pts.ne.y >= y - slack &&
          pts.sw.y <= y + h + slack;
        return inside ? "inside" : JSON.stringify({ x, y, w, h, ...pts });
      },
      { timeout: 8000 },
    )
    .toBe("inside");
}

test.describe("map page on the canvas", () => {
  test.skip(({ isMobile }) => isMobile, "wide screens only");

  for (const [width, cardWidth] of [
    [1280, 486],
    [1440, 547],
    [1920, 720],
  ]) {
    test(`the section sits inside the free area at ${width}`, async ({
      page,
    }) => {
      await open(page, { width, height: 900 });
      const b = await box(card(page));
      expect(Math.abs(b.width - cardWidth)).toBeLessThanOrEqual(1);
      await expect(page.locator(".maplibregl-map")).toHaveCount(1);
      await expectSectionInFreeArea(page);
    });
  }

  test("the card holds the section panel: back, tabs and features", async ({
    page,
  }) => {
    await open(page, { width: 1280, height: 800 });
    const c = card(page);
    await expect(c.getByRole("heading", { name: "Upper Test" })).toBeVisible();
    await expect(c.getByRole("tab", { name: "Features" })).toBeVisible();
    await expect(c.getByRole("button", { name: "Back" }).first()).toBeVisible();
    await expect(page.getByTestId("mobile-overlay")).toBeHidden();
    await c.getByRole("button", { name: "Back" }).first().click();
    await expect(page).not.toHaveURL(/section=/);
  });

  test("search opens a river in the card and frames its sections", async ({
    page,
  }) => {
    await open(page, { width: 1280, height: 800 }, "/");
    await expect(
      card(page).getByRole("heading", { name: "Search" }).first(),
    ).toBeVisible();
    await page.goto(`/?waterway=${FIX.waterway}`);
    await expect(
      card(page).getByRole("heading", { name: "Test River" }),
    ).toBeVisible();
    await expect(page.locator(".maplibregl-map")).toHaveCount(1);
  });

  for (const [width, height, expectedHeight] of [
    [1280, 720, 180],
    [1920, 1080, 238],
  ]) {
    test(`the chart docks at the foot from card edge + 16 to window edge - 16 at ${width}`, async ({
      page,
    }) => {
      await open(page, { width, height });
      const dock = await box(page.getByTestId("chart-dock"));
      const c = await box(card(page));
      expect(Math.abs(dock.x - (c.x + c.width + 16))).toBeLessThanOrEqual(1);
      expect(Math.abs(dock.x + dock.width - (width - 16))).toBeLessThanOrEqual(
        1,
      );
      expect(dock.height).toBeLessThanOrEqual(260);
      expect(Math.abs(dock.height - expectedHeight)).toBeLessThanOrEqual(1);
      await expect(
        page.getByTestId("chart-dock").getByTestId("chart-card"),
      ).toBeVisible();
      await expectSectionInFreeArea(page);
    });
  }

  test("the dock is longer at 1920 than at 1280, not taller than 260", async ({
    page,
  }) => {
    await open(page, { width: 1280, height: 900 });
    const narrow = await box(page.getByTestId("chart-dock"));
    await open(page, { width: 1920, height: 900 });
    const wide = await box(page.getByTestId("chart-dock"));
    expect(wide.width).toBeGreaterThan(narrow.width);
    expect(wide.height).toBeLessThanOrEqual(260);
  });

  test("a river with no section selected has no dock", async ({ page }) => {
    await open(
      page,
      { width: 1440, height: 900 },
      `/?waterway=${FIX.waterway}`,
    );
    await expect(page.getByTestId("chart-dock")).toHaveCount(0);
  });

  test("under 1280 the chart is the first block of the card", async ({
    page,
  }) => {
    await open(page, { width: 1024, height: 800 });
    await expect(page.getByTestId("chart-dock")).toHaveCount(0);
    const chart = await box(card(page).getByTestId("chart-card"));
    const features = await box(card(page).getByText("2 features"));
    expect(chart.y).toBeLessThan(features.y);
    await expectSectionInFreeArea(page);
  });

  test("the logs tab gives the dock back its space", async ({ page }) => {
    await open(page, { width: 1440, height: 900 });
    await card(page).getByRole("tab", { name: "Logs" }).click();
    await expect(page.getByTestId("chart-dock")).toHaveCount(0);
  });

  // The map's own controls (layer toggle, satellite) sit at the bottom-left
  // and the foundation cannot move them off the card yet.
  test.fail(
    "the layer toggle is clear of the detail card",
    async ({ page }) => {
      await open(page, { width: 1280, height: 800 });
      const toggle = await box(page.getByTestId("map-layer-toggle"));
      const c = await box(card(page));
      expect(toggle.x).toBeGreaterThanOrEqual(c.x + c.width);
    },
  );
});

test.describe("map page on a phone", () => {
  test.skip(({ isMobile }) => !isMobile, "phones only");

  test("no canvas host: the overlay and the pane's own map", async ({
    page,
  }) => {
    await page.goto(section);
    await appReady(page);
    await expect(page.getByTestId("canvas-host")).toHaveCount(0);
    await expect(page.getByTestId("mobile-overlay")).toBeVisible();
    await expect(page.locator(".maplibregl-map")).toHaveCount(1);
    await expect(page.getByTestId("chart-dock")).toHaveCount(0);
    await expect(page.getByTestId("chart-card")).toBeVisible();
  });
});
