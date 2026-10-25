import { expect, type Page, test } from "@playwright/test";
import { appReady, FIX } from "../support/fixture";

// WP16b: the map page (/) on the shared canvas. From md the detail card floats
// over the one full-window map; from 1280 its foot is the reading block and the
// chart continues it as a rail along the window foot. The selected section is
// kept inside the free area; the phone is unchanged.

/** Corners of the "Upper Test" section line (seed.sql). */
const SW: [number, number] = [11.0, 47.0];
const NE: [number, number] = [11.01, 47.01];
/** Corners of the "Lower Test" section line, the one with a gauge and rail. */
const LOWER_SW: [number, number] = [11.01, 47.01];
const LOWER_NE: [number, number] = [11.02, 47.02];

type MapLike = {
  isMoving(): boolean;
  loaded(): boolean;
  project(lngLat: [number, number]): { x: number; y: number };
};

const section = `/?waterway=${FIX.waterway}&section=${FIX.sections.upper}`;
// "Lower Test" has nine features, so its list needs the card's full height.
const longSection = `/?waterway=${FIX.waterway}&section=${FIX.sections.lower}`;
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

async function expectSectionInFreeArea(
  page: Page,
  corners: readonly [[number, number], [number, number]] = [SW, NE],
) {
  await expect
    .poll(
      async () => {
        const raw = await page
          .getByTestId("canvas-host")
          .getAttribute("data-free");
        const [x, y, w, h] = (raw ?? "").split(",").map(Number);
        const pts = await page.evaluate(([sw, ne]) => {
          const map = (window as unknown as { __paddlemateMap?: MapLike })
            .__paddlemateMap;
          if (!map || map.isMoving()) return null;
          return { sw: map.project(sw), ne: map.project(ne) };
        }, corners);
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
    [1280, 340],
    [1440, 374],
    [1920, 440],
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
    await expect(card(page).getByRole("tab", { name: "Name" })).toBeVisible();
    await page.goto(`/?waterway=${FIX.waterway}`);
    await expect(
      card(page).getByRole("heading", { name: "Test River" }),
    ).toBeVisible();
    await expect(page.locator(".maplibregl-map")).toHaveCount(1);
  });

  for (const [width, height, rail] of [
    [1280, 720, 184],
    [1440, 900, 198],
    [1920, 1080, 238],
  ]) {
    test(`the card runs the full height and the rail continues its foot at ${width}`, async ({
      page,
    }) => {
      await open(page, { width, height }, longSection);
      const dock = await box(page.getByTestId("chart-dock"));
      const c = await box(card(page));
      expect(Math.abs(c.y - 72)).toBeLessThanOrEqual(1);
      expect(Math.abs(c.y + c.height - (height - 16))).toBeLessThanOrEqual(1);
      // The rail starts one 8px gap past the card edge.
      expect(Math.abs(dock.x - (c.x + c.width + 8))).toBeLessThanOrEqual(1);
      expect(Math.abs(dock.x + dock.width - (width - 16))).toBeLessThanOrEqual(
        1,
      );
      expect(Math.abs(dock.height - rail)).toBeLessThanOrEqual(1);
      expect(
        Math.abs(dock.y + dock.height - (height - 16)),
      ).toBeLessThanOrEqual(1);
      // The reading is an inset card like the features card: its top meets
      // the rail's top, its foot sits one 8px inset above the card's foot.
      const block = await box(card(page).getByTestId("reading-block"));
      expect(Math.abs(block.y - dock.y)).toBeLessThanOrEqual(1);
      expect(
        Math.abs(block.y + block.height - (c.y + c.height - 8)),
      ).toBeLessThanOrEqual(1);
      await expect(page.getByTestId("chart-plot")).toBeVisible();
      await expectSectionInFreeArea(page, [LOWER_SW, LOWER_NE]);
    });
  }

  test("the rail is longer at 1920 than at 1280, never taller than 248", async ({
    page,
  }) => {
    await open(page, { width: 1280, height: 900 }, longSection);
    const narrow = await box(page.getByTestId("chart-dock"));
    await open(page, { width: 1920, height: 900 }, longSection);
    const wide = await box(page.getByTestId("chart-dock"));
    expect(wide.width).toBeGreaterThan(narrow.width);
    expect(wide.height).toBeLessThanOrEqual(248);
  });

  test("a river with no section selected has no rail", async ({ page }) => {
    await open(
      page,
      { width: 1440, height: 900 },
      `/?waterway=${FIX.waterway}`,
    );
    await expect(page.getByTestId("chart-dock")).toHaveCount(0);
  });

  test("a section without a gauge has no rail and a foot row", async ({
    page,
  }) => {
    await open(
      page,
      { width: 1440, height: 900 },
      `/?waterway=${FIX.waterway}&section=${FIX.sections.empty}`,
    );
    await expect(page.getByTestId("chart-dock")).toHaveCount(0);
    const row = card(page).getByTestId("no-gauge");
    await expect(row).toContainText("No gauge for this section");
    await expect(
      row.getByRole("button", { name: "Link a gauge" }),
    ).toBeVisible();
    const r = await box(row);
    const c = await box(card(page));
    expect(Math.abs(r.height - 64)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.y + r.height - (c.y + c.height))).toBeLessThanOrEqual(1);
  });

  test("under 1280 the chart is the first block of a card that hugs its content", async ({
    page,
  }) => {
    await open(page, { width: 1024, height: 800 });
    await expect(page.getByTestId("chart-dock")).toHaveCount(0);
    const chart = await box(card(page).getByTestId("chart-card"));
    const features = await box(card(page).getByText("2 features"));
    expect(chart.y).toBeLessThan(features.y);
    const c = await box(card(page));
    expect(Math.abs(c.width - 360)).toBeLessThanOrEqual(1);
    await expectSectionInFreeArea(page);
  });

  test("a window under 600 tall has no rail even when wide", async ({
    page,
  }) => {
    await open(page, { width: 1440, height: 560 });
    await expect(page.getByTestId("chart-dock")).toHaveCount(0);
    await expect(card(page).getByTestId("chart-card")).toBeVisible();
  });

  test("the logs tab keeps the rail", async ({ page }) => {
    await open(page, { width: 1440, height: 900 }, longSection);
    await card(page).getByRole("tab", { name: "Logs" }).click();
    await expect(page.getByTestId("chart-dock")).toBeVisible();
    await expect(card(page).getByTestId("reading-block")).toBeVisible();
  });

  test("the period menu opens over the map and leaves the plot alone", async ({
    page,
  }) => {
    await open(page, { width: 1440, height: 900 }, longSection);
    const before = await box(page.getByTestId("chart-plot"));
    await page.getByRole("button", { name: "Chart period" }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const during = await box(page.getByTestId("chart-plot"));
    expect(during.height).toBe(before.height);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });

  test("the layer toggle is one key under the zoom group and opens a popover to its left", async ({
    page,
  }) => {
    await open(page, { width: 1440, height: 900 });
    const key = page.getByTestId("map-layer-button");
    const k = await box(key);
    const c = await box(card(page));
    expect(k.x).toBeGreaterThanOrEqual(c.x + c.width);
    expect(Math.abs(k.x + k.width - (1440 - 16))).toBeLessThanOrEqual(1);
    expect(Math.abs(k.width - 44)).toBeLessThanOrEqual(1);
    const zoom = await box(page.locator(".maplibregl-ctrl-group").first());
    expect(Math.abs(k.y - (zoom.y + zoom.height + 8))).toBeLessThanOrEqual(1);
    // The compass arrives below the layers key; the key does not move.
    await page.evaluate(() => window.__paddlemateMap?.setBearing(40));
    const compass = await box(
      page.getByRole("button", { name: "Reset bearing to north" }),
    );
    expect(compass.y).toBeGreaterThan(k.y + k.height);
    expect(Math.abs((await box(key)).y - k.y)).toBeLessThanOrEqual(1);
    await page.evaluate(() => window.__paddlemateMap?.setBearing(0));
    await expect(page.getByTestId("map-layer-toggle")).toHaveCount(0);
    await key.click();
    await expect(page.getByTestId("map-layer-toggle")).toHaveCSS(
      "transform",
      "none",
    );
    const pop = await box(page.getByTestId("map-layer-toggle"));
    expect(pop.x + pop.width).toBeLessThanOrEqual(k.x);
    expect(Math.abs(pop.width - 272)).toBeLessThanOrEqual(24);
    await page.getByRole("button", { name: "Satellite" }).click();
    await expect(
      page.getByRole("button", { name: "Satellite" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("the card shows one header, the panel's own", async ({ page }) => {
    await open(page, { width: 1440, height: 800 });
    await expect(card(page).getByRole("tablist")).toHaveCount(1);
  });
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
