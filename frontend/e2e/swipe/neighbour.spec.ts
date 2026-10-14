import { expect, type Page, test } from "@playwright/test";
import { Finger } from "../support/finger";

// While the finger moves, the neighbouring tab is already beside the pane,
// with content, instead of blank space that fills in after the release.

test.use({ hasTouch: true });

const GHOST = "[data-testid=swipe-ghost]";

/** Drags left from 80% of `selector` by half its width and keeps the finger
 * down. The caller releases it. */
async function dragHalf(page: Page, selector: string, yShare?: number) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  const f = await Finger.down(
    page,
    box.x + box.width * 0.8,
    box.y + (yShare ? box.height * yShare : Math.min(box.height / 2, 120)),
  );
  await f.moveBy(-box.width * 0.5);
  return { f, box };
}

/** The ghost holds real content and sits where the finger is dragging it. */
async function expectGhostFilled(page: Page, viewport: number) {
  const ghost = page.locator(GHOST);
  await expect(ghost).toHaveCount(1);
  await expect
    .poll(
      () =>
        ghost.evaluate((el) => ({
          nodes: el.querySelectorAll("*").length,
          text: (el as HTMLElement).innerText.trim().length,
          height: el.getBoundingClientRect().height,
        })),
      { message: "ghost content" },
    )
    .toMatchObject({ height: expect.any(Number) });
  const info = await ghost.evaluate((el) => ({
    nodes: el.querySelectorAll("*").length,
    left: el.getBoundingClientRect().left,
    width: el.getBoundingClientRect().width,
    height: el.getBoundingClientRect().height,
  }));
  expect(info.nodes, "ghost has content, not blank").toBeGreaterThan(2);
  expect(info.height).toBeGreaterThan(40);
  // Half the width in: the ghost's left edge is inside the viewport.
  expect(info.left).toBeGreaterThan(0);
  expect(info.left).toBeLessThan(viewport);
  await expect(ghost).toHaveAttribute("aria-hidden", "true");
}

test.describe("the next tab is there while swiping", () => {
  test("section tabs: Logs sits beside Features mid-swipe", async ({
    page,
  }, info) => {
    test.skip(info.project.name === "desktop", "touch layouts only");
    await page.goto("/?waterway=9001&section=9101");
    await expect(page.getByRole("tab", { name: "Logs" })).toBeVisible();
    const { f } = await dragHalf(page, "[data-testid=tab-pane]:visible");
    await expectGhostFilled(page, page.viewportSize()?.width ?? 400);
    await page.screenshot({ path: info.outputPath("section-mid-swipe.png") });
    await f.up();
    await expect(page.getByRole("tab", { name: "Logs" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.locator(GHOST)).toHaveCount(0);
  });

  test("river tabs: Gauges sits beside Sections mid-swipe", async ({
    page,
  }, info) => {
    test.skip(info.project.name === "desktop", "touch layouts only");
    await page.goto("/?waterway=9001");
    await expect(page.getByRole("tab", { name: "Gauges" })).toBeVisible();
    const { f } = await dragHalf(page, "[data-testid=tab-pane]:visible");
    await expectGhostFilled(page, page.viewportSize()?.width ?? 400);
    await page.screenshot({ path: info.outputPath("river-mid-swipe.png") });
    await f.up();
    await expect(page.getByRole("tab", { name: "Gauges" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("logs: Social sits beside My logs mid-swipe", async ({ page }, info) => {
    test.skip(info.project.name === "desktop", "touch layouts only");
    await page.goto("/logs");
    await expect(page.getByRole("tab", { name: "Social" })).toBeVisible();
    const { f } = await dragHalf(page, "[role=tablist]");
    await expectGhostFilled(page, page.viewportSize()?.width ?? 400);
    await page.screenshot({ path: info.outputPath("logs-mid-swipe.png") });
    await f.up();
    await expect(page.getByRole("tab", { name: "Social" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("search: Area sits beside Name mid-swipe", async ({ page }, info) => {
    test.skip(info.project.name === "desktop", "touch layouts only");
    await page.goto("/?panel=1");
    await expect(page.getByTestId("search-pane")).toBeVisible();
    const { f } = await dragHalf(page, "[data-testid=search-pane]", 0.75);
    await expectGhostFilled(page, page.viewportSize()?.width ?? 400);
    await page.screenshot({ path: info.outputPath("search-mid-swipe.png") });
    await f.up();
    await expect(page.getByRole("tab", { name: "Area" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("trip tabs: Bases sits beside Plan mid-swipe", async ({
    page,
  }, info) => {
    test.skip(info.project.name === "desktop", "touch layouts only");
    await page.goto("/trips/9001");
    await expect(page.getByRole("tab", { name: "Bases" })).toBeVisible();
    await expect(page.getByTestId("trip-pane")).toBeVisible();
    const { f } = await dragHalf(page, "[data-testid=trip-pane]");
    await expectGhostFilled(page, page.viewportSize()?.width ?? 400);
    await page.screenshot({ path: info.outputPath("trip-mid-swipe.png") });
    await f.up();
    await expect(page.getByRole("tab", { name: "Bases" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.locator(GHOST)).toHaveCount(0);
  });

  test("the first trip tab has no neighbour to the left", async ({
    page,
  }, info) => {
    test.skip(info.project.name === "desktop", "touch layouts only");
    await page.goto("/trips/9001");
    await expect(page.getByTestId("trip-pane")).toBeVisible();
    const box = await page.getByTestId("trip-pane").boundingBox();
    if (!box) throw new Error("no pane");
    const f = await Finger.down(page, box.x + box.width * 0.4, box.y + 100);
    await f.moveBy(box.width * 0.3);
    await expect(page.locator(GHOST)).toHaveCount(0);
    await f.up();
  });

  test("the first tab has no neighbour to the left", async ({ page }, info) => {
    test.skip(info.project.name === "desktop", "touch layouts only");
    await page.goto("/?waterway=9001&section=9101");
    await expect(page.getByRole("tab", { name: "Logs" })).toBeVisible();
    const box = await page
      .locator("[data-testid=tab-pane]:visible")
      .boundingBox();
    if (!box) throw new Error("no pane");
    const f = await Finger.down(page, box.x + box.width * 0.4, box.y + 100);
    await f.moveBy(box.width * 0.3);
    await expect(page.locator(GHOST)).toHaveCount(0);
    await f.up();
  });
});
