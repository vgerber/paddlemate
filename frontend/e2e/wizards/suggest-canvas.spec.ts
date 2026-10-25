import { expect, type Page, test } from "@playwright/test";
import { FIX } from "../support/fixture";

// The suggest-section wizard on the shared canvas: a side card over the one
// host map, which takes the line and feature picking. Phones keep their map.

const URL = `/waterways/suggest-section?waterway=${FIX.waterway}`;
const card = (page: Page) => page.getByTestId("canvas-card-suggest");

async function toLineStep(page: Page) {
  // Overpass is never called from the spec.
  await page.route(/overpass/, (route) => route.abort());
  await page.goto(URL);
  await page.getByLabel("Name").first().fill("Canvas Spec Section");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Step 2 of 3 · Section")).toBeVisible();
}

test.describe("suggest section on the canvas", () => {
  test.skip(({ isMobile }) => isMobile, "wide screens only");

  for (const w of [1000, 1280]) {
    test(`is a floating card over the one map at ${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await toLineStep(page);
      await expect(card(page)).toBeVisible();
      await expect(page.getByTestId("canvas-host")).toHaveCount(1);
      await expect(page.locator(".maplibregl-map")).toHaveCount(1);
      await expect(card(page).locator("canvas")).toHaveCount(0);
      const b = await card(page).boundingBox();
      if (!b) throw new Error("no card");
      expect(b.x + b.width).toBeLessThan(w - 8);
      expect(b.y).toBeGreaterThanOrEqual(56 + 8);
      expect(b.y + b.height).toBeLessThan(800 - 8);
      const cancel = await card(page)
        .getByRole("button", { name: "Back" })
        .boundingBox();
      expect(cancel && cancel.y + cancel.height > b.y + b.height - 100).toBe(
        true,
      );
    });

    test(`picking on the map sets the line and the steps go on at ${w}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await toLineStep(page);
      await expect(card(page).getByTestId("unpicked-put-in")).toBeVisible();
      const map = await page.locator(".maplibregl-map").boundingBox();
      if (!map) throw new Error("no map");
      for (const [pin, fx] of [
        ["Put-in", 0.1],
        ["Take-out", 0.3],
      ] as const) {
        await page
          .locator("button[aria-pressed]")
          .filter({ hasText: pin })
          .click();
        await page.mouse.click(
          map.x + map.width * fx,
          map.y + map.height * 0.6,
        );
      }
      await expect(card(page).getByTestId("unpicked-put-in")).toHaveCount(0);
      await expect(card(page).getByTestId("unpicked-take-out")).toHaveCount(0);
      await page.getByRole("button", { name: "Next" }).click();
      await expect(page.getByText("Step 3 of 3 · Features")).toBeVisible();
      await expect(page.locator(".maplibregl-map")).toHaveCount(1);
      await page.getByRole("button", { name: "Back" }).click();
      await expect(page.getByText("Step 2 of 3 · Section")).toBeVisible();
    });

    test(`the pick buttons clear every card at ${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await toLineStep(page);
      const buttons = await page
        .locator("button[aria-pressed]")
        .filter({ hasText: /Put-in|Take-out/ })
        .evaluateAll((els) =>
          els.map((e) => {
            const r = e.getBoundingClientRect();
            return { x: r.x, y: r.y, r: r.right, b: r.bottom };
          }),
        );
      expect(buttons.length).toBeGreaterThan(0);
      const cards = await page
        .locator("[data-testid^=canvas-card-]")
        .evaluateAll((els) =>
          els.map((e) => {
            const r = e.getBoundingClientRect();
            return { x: r.x, y: r.y, r: r.right, b: r.bottom };
          }),
        );
      for (const a of buttons)
        for (const c of cards)
          expect(a.r <= c.x || a.x >= c.r || a.b <= c.y || a.y >= c.b).toBe(
            true,
          );
    });
  }
});

test.describe("suggest section on a phone", () => {
  test.skip(({ isMobile }) => !isMobile, "phone only");

  test("keeps its own map and there is no canvas", async ({ page }) => {
    await toLineStep(page);
    await expect(page.getByTestId("canvas-host")).toHaveCount(0);
    await expect(page.locator(".maplibregl-map")).toHaveCount(1);
  });
});
