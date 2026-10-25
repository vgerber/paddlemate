import { expect, type Page, test } from "@playwright/test";
import { FIX } from "../support/fixture";

// WP16c: logs on the shared map canvas. Fixture: Vincent's logs 9201 (two
// sections, put-in 47.0/11.0, take-out 47.02/11.02) and 9202.

type MapLike = {
  isMoving(): boolean;
  loaded(): boolean;
  project(lngLat: [number, number]): { x: number; y: number };
  getFilter(id: string): unknown;
};

const PUT_IN: [number, number] = [11.0, 47.0];
const TAKE_OUT: [number, number] = [11.02, 47.02];

const next = (page: Page) => page.getByRole("button", { name: "Next" });

const card = (page: Page, id: string) => page.getByTestId(`canvas-card-${id}`);

async function width(page: Page, id: string) {
  const b = await card(page, id).boundingBox();
  if (!b) throw new Error(`no ${id} card`);
  return b.width;
}

async function settle(page: Page) {
  await page.waitForFunction(() => {
    const map = (window as unknown as { __paddlemateMap?: MapLike })
      .__paddlemateMap;
    return !!map && map.loaded() && !map.isMoving();
  });
}

/** How many sections the map draws highlighted (teal) for the open log. */
function drawnRoute(page: Page) {
  return page.evaluate(() => {
    const map = (window as unknown as { __paddlemateMap?: MapLike })
      .__paddlemateMap;
    const filter = map?.getFilter("sections-highlight-line") as
      | [string, unknown, [string, number[]]]
      | undefined;
    return filter?.[2]?.[1]?.length ?? 0;
  });
}

test.describe("logs on the canvas", () => {
  test.skip(({ isMobile }) => isMobile, "wide screens only");

  for (const [w, list, side] of [
    [1440, 300, 400],
    [1920, 380, 480],
  ]) {
    test(`list card ${list}px and log card ${side}px at ${w}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto("/logs/9201");
      await expect(card(page, "log")).toBeVisible();
      expect(Math.abs((await width(page, "list")) - list)).toBeLessThanOrEqual(
        1,
      );
      expect(Math.abs((await width(page, "log")) - side)).toBeLessThanOrEqual(
        1,
      );
    });
  }

  test("without an open log only the list card shows", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/logs");
    await expect(card(page, "list")).toBeVisible();
    await expect(card(page, "log")).toHaveCount(0);
    await expect(page.getByTestId("canvas-host")).toBeVisible();
  });

  for (const w of [1280, 1440]) {
    test(`a deep link opens the log and frames put-in and take-out in the free area at ${w}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await page.goto("/logs/9201");
      await expect(card(page, "log")).toContainText("Public multi-section run");
      await settle(page);
      await expect.poll(() => drawnRoute(page)).toBeGreaterThan(1);
      await expect
        .poll(async () => {
          const raw = await page
            .getByTestId("canvas-host")
            .getAttribute("data-free");
          const [x, y, w, h] = (raw ?? "").split(",").map(Number);
          const pts = await page.evaluate(
            ([a, b]) => {
              const map = (window as unknown as { __paddlemateMap?: MapLike })
                .__paddlemateMap;
              if (!map || map.isMoving()) return null;
              return { a: map.project(a), b: map.project(b) };
            },
            [PUT_IN, TAKE_OUT] as const,
          );
          if (!pts) return "moving";
          // Clear of the edge, where the zoom keys sit.
          const slack = -40;
          const inside = [pts.a, pts.b].every(
            (p) =>
              p.x >= x - slack &&
              p.x <= x + w + slack &&
              p.y >= y - slack &&
              p.y <= y + h + slack,
          );
          return inside ? "inside" : JSON.stringify({ x, y, w, h, ...pts });
        })
        .toBe("inside");
    });
  }

  test("the log card has no map of its own", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/logs/9201");
    await expect(card(page, "log")).toContainText("Put in");
    await expect(card(page, "log").locator("canvas")).toHaveCount(0);
    await expect(page.locator("canvas.maplibregl-canvas")).toHaveCount(1);
  });

  test("opening another log redraws the route and closing it clears it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/logs/9201");
    await settle(page);
    await expect.poll(() => drawnRoute(page)).toBeGreaterThan(1);
    await card(page, "list")
      .getByTestId("descent-card")
      .filter({ hasText: "Private upper run" })
      .click();
    await expect(page).toHaveURL(/\/logs\/9202/);
    await expect(card(page, "log")).toContainText("Private upper run");
    await expect.poll(() => drawnRoute(page)).toBeGreaterThan(0);
  });
});

/** A click on the upper fixture section, as the map projects it. */
async function clickUpper(page: Page) {
  const spot = await page.evaluate(
    (p) => {
      const map = (window as unknown as { __paddlemateMap?: MapLike })
        .__paddlemateMap;
      const at = map?.project(p);
      const box = document
        .querySelector(".maplibregl-map")
        ?.getBoundingClientRect();
      return at && box ? { x: box.x + at.x, y: box.y + at.y } : null;
    },
    [11.005, 47.005] as [number, number],
  );
  if (!spot) throw new Error("map not ready");
  await page.mouse.click(spot.x, spot.y);
}

test.describe("the log form on the canvas", () => {
  test.skip(({ isMobile }) => isMobile, "wide screens only");

  const NEW = `/logs/new?waterwayId=${FIX.waterway}&sectionId=${FIX.sections.upper}`;

  for (const w of [1000, 1280]) {
    test(`is a floating card over the one map at ${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await page.goto("/logs/new");
      await expect(page.getByText("Step 1 of 3 · When")).toBeVisible();
      await expect(card(page, "log")).toBeVisible();
      await expect(page.getByTestId("canvas-host")).toHaveCount(1);
      await expect(page.locator(".maplibregl-map")).toHaveCount(1);
      // The card floats: margins around it, not a full-height sidebar.
      const b = await card(page, "log").boundingBox();
      if (!b) throw new Error("no card");
      expect(b.x + b.width).toBeLessThan(w - 8);
      expect(b.y).toBeGreaterThanOrEqual(56 + 8);
      expect(b.y + b.height).toBeLessThan(800 - 8);
      // The bar stays at the card's foot.
      const cancel = await card(page, "log")
        .getByRole("button", { name: "Cancel" })
        .boundingBox();
      expect(cancel && cancel.y + cancel.height > b.y + b.height - 100).toBe(
        true,
      );
      // The cards leave the map room.
      const list = (await card(page, "list").count())
        ? await width(page, "list")
        : 0;
      expect(b.width + list).toBeLessThanOrEqual(w * 0.7 + 1);
    });

    test(`the steps work and a click on the map picks a section at ${w}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await page.goto(NEW);
      await expect(card(page, "log")).toBeVisible();
      await next(page).click();
      await expect(page.getByText("Step 2 of 3 · Sections")).toBeVisible();
      await expect(page.locator(".maplibregl-map")).toHaveCount(1);
      await expect(card(page, "log")).toContainText("Upper Test");
      await settle(page);
      // A click on the section on the map takes it out of the log, and
      // another puts it back.
      await clickUpper(page);
      await expect(card(page, "log")).not.toContainText("Upper Test");
      await clickUpper(page);
      await expect(card(page, "log")).toContainText("Upper Test");
      await next(page).click();
      await expect(page.getByText("Step 3 of 3 · Details")).toBeVisible();
      await page.getByRole("button", { name: "Back" }).click();
      await page.getByRole("button", { name: "Back" }).click();
      await expect(page.getByText("Step 1 of 3 · When")).toBeVisible();
    });
  }

  test("where the list would fold beside it, the form is the one card", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.goto("/logs/new");
    await expect(card(page, "log")).toBeVisible();
    await expect(card(page, "list")).toHaveCount(0);
    const b = await card(page, "log").boundingBox();
    expect(b && b.x < 100).toBe(true);
    await page.setViewportSize({ width: 1600, height: 900 });
    await expect(card(page, "list")).toBeVisible();
    await expect(card(page, "log")).toBeVisible();
  });

  test("the map changes no pick on the other steps", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(NEW);
    await expect(card(page, "log")).toBeVisible();
    await settle(page);
    await clickUpper(page);
    await next(page).click();
    await next(page).click();
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByText("Step 1 of 3 · When")).toBeVisible();
    await next(page).click();
    await expect(card(page, "log")).toContainText("Upper Test");
  });

  test("editing a log is the same card over the one map", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.goto("/logs/9201?edit=true");
    await expect(page.getByText("Step 1 of 3 · When")).toBeVisible();
    await expect(card(page, "log")).toBeVisible();
    await expect(page.locator(".maplibregl-map")).toHaveCount(1);
    await expect(page.getByTestId("canvas-host")).toHaveCount(1);
  });
});

test.describe("logs on a phone", () => {
  test.skip(({ isMobile }) => !isMobile, "phone only");

  test("a log keeps its own map and there is no canvas", async ({ page }) => {
    await page.goto("/logs/9201");
    await expect(page.getByText("Sections (2)")).toBeVisible();
    await expect(page.getByTestId("canvas-host")).toHaveCount(0);
    await expect(page.locator("canvas.maplibregl-canvas")).toHaveCount(1);
  });
});

test.describe("the log form on a phone", () => {
  test.skip(({ isMobile }) => !isMobile, "phone only");

  test("keeps its own picker map and there is no canvas", async ({ page }) => {
    await page.goto(
      `/logs/new?waterwayId=${FIX.waterway}&sectionId=${FIX.sections.upper}`,
    );
    await next(page).click();
    await expect(page.getByText("Step 2 of 3 · Sections")).toBeVisible();
    await expect(page.getByTestId("canvas-host")).toHaveCount(0);
    await expect(page.locator(".maplibregl-map")).toHaveCount(1);
  });
});
