import { expect, type Page, test } from "@playwright/test";
import { appReady, computed } from "../support/fixture";

// WP16a: the canvas foundation, driven on the development-only demo route
// (/dev/canvas) with a fake scene. The real screens do not use the canvas
// yet, so the last block holds that they look as before.

const E2 =
  "rgba(31, 43, 49, 0.12) 0px 8px 24px 0px, rgba(31, 43, 49, 0.08) 0px 2px 6px 0px";

/** Corners of the demo scene's subject, as the demo draws them. */
const SW: [number, number] = [11.0, 47.6];
const NE: [number, number] = [12.6, 48.4];

type MapLike = {
  isMoving(): boolean;
  loaded(): boolean;
  project(lngLat: [number, number]): { x: number; y: number };
  on(event: string, fn: () => void): void;
};

async function openDemo(
  page: Page,
  size: { width: number; height: number },
  cards = "detail",
) {
  await page.setViewportSize(size);
  await page.goto(`/dev/canvas?cards=${cards}`);
  await expect(page.getByTestId("canvas-host")).toBeVisible();
  await settle(page);
}

/** The camera has stopped and the style and tiles have loaded. */
async function settle(page: Page) {
  await page.waitForFunction(() => {
    const map = (window as unknown as { __paddlemateMap?: MapLike })
      .__paddlemateMap;
    return !!map && map.loaded() && !map.isMoving();
  });
}

const card = (page: Page, id = "detail") =>
  page.getByTestId(`canvas-card-${id}`);

async function box(locator: ReturnType<Page["locator"]>) {
  const b = await locator.boundingBox();
  if (!b) throw new Error("no box");
  return b;
}

async function padding(page: Page) {
  const raw = await page
    .getByTestId("canvas-host")
    .getAttribute("data-padding");
  const [top, right, bottom, left] = (raw ?? "").split(",").map(Number);
  return { top, right, bottom, left };
}

/** The subject's projected corners lie inside the free rect, which the host
 * publishes in its own coordinates (the map fills it). */
async function expectSubjectInFreeArea(page: Page) {
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

test.describe("canvas foundation", () => {
  test.skip(({ isMobile }) => isMobile, "wide screens only");

  for (const [width, expected] of [
    [1280, 486],
    [1440, 547],
    [1920, 720],
  ]) {
    test(`the detail card is ${expected}px wide at ${width}`, async ({
      page,
    }) => {
      await openDemo(page, { width, height: 900 });
      const b = await box(card(page));
      expect(Math.abs(b.width - expected)).toBeLessThanOrEqual(1);
      expect(b.x).toBe(16);
    });
  }

  test("the card is a floating surface in the design tokens", async ({
    page,
  }) => {
    await openDemo(page, { width: 1280, height: 800 });
    const c = card(page);
    expect(await computed(c, "border-radius")).toBe("16px");
    expect(await computed(c, "box-shadow")).toBe(E2);
    expect(await computed(c, "pointer-events")).toBe("auto");
    expect(await computed(c.locator(".."), "pointer-events")).toBe("none");
    const b = await box(c);
    expect(b.y).toBe(56 + 16);
    expect(Math.round(b.y + b.height)).toBe(800 - 16);
    for (const el of await page.locator("button:visible").all()) {
      expect(await computed(el, "text-transform")).toBe("none");
    }
  });

  test("a drag on the grip resizes the card and is remembered", async ({
    page,
  }) => {
    await openDemo(page, { width: 1280, height: 800 });
    const before = (await box(card(page))).width;
    const grip = page.getByRole("separator", { name: "Resize panel" });
    await expect(grip).toHaveAttribute("aria-orientation", "vertical");
    await expect(grip).toHaveAttribute("aria-valuemin", "360");
    await expect(grip).toHaveAttribute("aria-valuemax", "576");
    const g = await box(grip);
    expect(g.width).toBe(20);
    expect(g.height).toBeGreaterThanOrEqual(44);
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(g.x + g.width / 2 + 60, g.y + g.height / 2, {
      steps: 6,
    });
    await page.mouse.up();
    await expect
      .poll(async () => Math.round((await box(card(page))).width))
      .toBe(Math.round(before + 60));
    await settle(page);
    const dragged = (await box(card(page))).width;

    await page.reload();
    await expect(card(page)).toBeVisible();
    expect(
      Math.abs((await box(card(page))).width - dragged),
    ).toBeLessThanOrEqual(1);
  });

  test("a drag stops at the limits", async ({ page }) => {
    await openDemo(page, { width: 1280, height: 800 });
    const g = await box(page.getByRole("separator", { name: "Resize panel" }));
    await page.mouse.move(g.x + 10, g.y + 100);
    await page.mouse.down();
    await page.mouse.move(g.x + 10 + 600, g.y + 100, { steps: 4 });
    await page.mouse.up();
    await expect
      .poll(async () => Math.round((await box(card(page))).width))
      .toBe(576);
  });

  test("the page renders and the card works with storage blocked", async ({
    page,
  }) => {
    // Only the card's own key throws: the sign-in library needs storage too,
    // and what is under test is that a card never depends on it.
    await page.addInitScript(() => {
      for (const method of ["getItem", "setItem"]) {
        const real = Reflect.get(Storage.prototype, method);
        Reflect.set(
          Storage.prototype,
          method,
          function (this: Storage, ...args: string[]) {
            if (String(args[0]).startsWith("paddlemate.cardFrac")) {
              throw new Error("blocked");
            }
            return real.apply(this, args);
          },
        );
      }
    });
    await openDemo(page, { width: 1280, height: 800 });
    const b = await box(card(page));
    expect(Math.abs(b.width - 486)).toBeLessThanOrEqual(1);
    await page.getByRole("separator", { name: "Resize panel" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(async () => Math.round((await box(card(page))).width))
      .toBe(Math.round(b.width + 16));
  });

  test("ArrowRight on the grip widens by 16 and survives a reload", async ({
    page,
  }) => {
    await openDemo(page, { width: 1280, height: 800 });
    const before = (await box(card(page))).width;
    const grip = page.getByRole("separator", { name: "Resize panel" });
    await grip.focus();
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(async () => Math.round((await box(card(page))).width))
      .toBe(Math.round(before + 16));
    await page.keyboard.press("Shift+ArrowLeft");
    await expect
      .poll(async () => Math.round((await box(card(page))).width))
      .toBe(Math.round(before + 16 - 64));
    await page.keyboard.press("End");
    await expect
      .poll(async () => Math.round((await box(card(page))).width))
      .toBe(576);
    await page.keyboard.press("Home");
    await expect
      .poll(async () => Math.round((await box(card(page))).width))
      .toBe(360);
    await page.reload();
    await expect(card(page)).toBeVisible();
    expect(Math.round((await box(card(page))).width)).toBe(360);
  });

  for (const width of [1280, 1920]) {
    test(`the free-area padding is the card edge plus 32 at ${width}`, async ({
      page,
    }) => {
      await openDemo(page, { width, height: 1000 });
      const b = await box(card(page));
      const pad = await padding(page);
      expect(Math.abs(pad.left - (b.x + b.width + 32))).toBeLessThanOrEqual(1);
      expect(pad.top).toBe(32);
      expect(pad.right).toBe(32);
      const dock = await box(page.getByTestId("chart-dock"));
      expect(pad.bottom).toBe(16 + Math.round(dock.height) + 32);
      await expectSubjectInFreeArea(page);
    });
  }

  test("the subject stays in the free area while the card is dragged", async ({
    page,
  }) => {
    await openDemo(page, { width: 1280, height: 800 });
    await expectSubjectInFreeArea(page);
    const g = await box(page.getByRole("separator", { name: "Resize panel" }));
    await page.mouse.move(g.x + 10, g.y + 100);
    await page.mouse.down();
    await page.mouse.move(g.x + 10 + 40, g.y + 100, { steps: 8 });
    await expectSubjectInFreeArea(page);
    await page.mouse.up();
    await expectSubjectInFreeArea(page);
    await expect
      .poll(async () => {
        const pad = await padding(page);
        const b = await box(card(page));
        return Math.abs(pad.left - (b.x + b.width + 32)) <= 1;
      })
      .toBe(true);
  });

  test("exactly one map at 1280", async ({ page }) => {
    await openDemo(page, { width: 1280, height: 800 });
    await expect(page.locator(".maplibregl-map")).toHaveCount(1);
  });

  test("two cards at 1024 fold the second to its header", async ({ page }) => {
    await openDemo(page, { width: 1024, height: 800 }, "detail,list");
    const list = card(page, "list");
    await expect(list).toHaveAttribute("data-collapsed", "true");
    const header = list.getByRole("button", { expanded: false });
    expect(Math.round((await box(list)).height)).toBe(56);
    expect((await box(header)).height).toBeGreaterThanOrEqual(44);
    await expect(card(page, "detail")).not.toHaveAttribute(
      "data-collapsed",
      "true",
    );
    expect(Math.round((await box(card(page, "detail"))).width)).toBe(420);

    await header.click();
    await expect(list).not.toHaveAttribute("data-collapsed", "true");
    await expect(card(page, "detail")).toHaveAttribute(
      "data-collapsed",
      "true",
    );
    expect(Math.round((await box(list)).width)).toBe(300);
  });

  test("the expanded cards never cover more than 55%", async ({ page }) => {
    for (const width of [1024, 1280, 1920]) {
      await openDemo(page, { width, height: 800 }, "detail,list,side");
      const open = page.locator(
        '[data-testid^="canvas-card-"]:not([data-collapsed])',
      );
      let covered = 0;
      for (const el of await open.all()) covered += (await box(el)).width;
      expect(covered).toBeLessThanOrEqual(width * 0.55 + 1);
    }
  });

  for (const [width, height, expected] of [
    [1280, 720, 180],
    [1920, 1080, 238],
    [1920, 1440, 260],
  ]) {
    test(`the chart dock is ${expected}px tall at ${width}x${height}`, async ({
      page,
    }) => {
      await openDemo(page, { width, height });
      const dock = await box(page.getByTestId("chart-dock"));
      expect(Math.abs(dock.height - expected)).toBeLessThanOrEqual(1);
      const b = await box(card(page));
      expect(Math.abs(dock.x - (b.x + b.width + 16))).toBeLessThanOrEqual(1);
      expect(Math.abs(dock.x + dock.width - (width - 16))).toBeLessThanOrEqual(
        1,
      );
      expect(Math.round(dock.y + dock.height)).toBe(height - 16);
      await expect(page.getByTestId("demo-chart")).toBeVisible();
    });
  }

  test("under 1280 the chart folds into the detail card as its first block", async ({
    page,
  }) => {
    await openDemo(page, { width: 1100, height: 800 });
    await expect(page.getByTestId("chart-dock")).toHaveCount(0);
    const chart = page.getByTestId("demo-chart");
    await expect(card(page).getByTestId("demo-chart")).toBeVisible();
    const c = await box(card(page));
    const ch = await box(chart);
    // Below the header, above the other content.
    expect(ch.y).toBeGreaterThanOrEqual(c.y + 56);
    expect(
      (await box(card(page).getByText("Detail content"))).y,
    ).toBeGreaterThan(ch.y);
  });

  test("the map is idle between interactions", async ({ page }) => {
    await openDemo(page, { width: 1280, height: 800 });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const map = (window as unknown as { __paddlemateMap?: MapLike })
        .__paddlemateMap;
      const w = window as unknown as { __renders: number };
      w.__renders = 0;
      map?.on("render", () => {
        w.__renders += 1;
      });
    });
    await page.waitForTimeout(2000);
    const renders = await page.evaluate(
      () => (window as unknown as { __renders: number }).__renders,
    );
    expect(renders).toBe(0);
  });

  test("a real screen is unchanged: no canvas host, its own map", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await appReady(page);
    await expect(page.getByTestId("canvas-host")).toHaveCount(0);
    await expect(page.locator(".maplibregl-map")).toHaveCount(1);
    await page.goto("/logs");
    await expect(page.getByTestId("canvas-host")).toHaveCount(0);
  });
});

test.describe("canvas foundation on a phone", () => {
  test.skip(({ isMobile }) => !isMobile, "phone only");

  test("no host and no map at 412", async ({ page }) => {
    await page.goto("/dev/canvas");
    await page.waitForLoadState("load");
    await expect(page.getByTestId("canvas-host")).toHaveCount(0);
    await expect(page.locator(".maplibregl-map")).toHaveCount(0);
    await expect(page.locator('[data-testid^="canvas-card-"]')).toHaveCount(0);
  });
});
