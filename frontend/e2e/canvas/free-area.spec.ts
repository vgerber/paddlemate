import { expect, type Page, test } from "@playwright/test";
import { appReady, gotoSection } from "../support/fixture";

// The desktop canvas keeps its promises: the signed-out gate is drawn above
// the map, a list card keeps its action docked, and the map controls stay in
// the free area at every width from 768.

test.skip(({ isMobile }) => isMobile, "desktop canvas only");

const box = async (page: Page, selector: string) => {
  const b = await page.locator(selector).first().boundingBox();
  if (!b) throw new Error(`no box for ${selector}`);
  return b;
};

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const [path, title] of [
    ["/logs", "Sign in to view your logs"],
    ["/trips", "Sign in to plan trips"],
  ] as const) {
    test(`${path} shows the gate above the map`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(path);
      const heading = page.getByRole("heading", { name: title });
      await expect(heading).toBeVisible();
      const top = await heading.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(
          r.x + r.width / 2,
          r.y + r.height / 2,
        );
        return hit === el || el.contains(hit);
      });
      expect(top, "the heading is the topmost element").toBe(true);
      if (path === "/logs") {
        await expect(page.getByTestId("canvas-card-gate")).toBeVisible();
      }
    });
  }

  test("the section menu offers no favorite", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoSection(page, "upper");
    await page.getByRole("button", { name: "Section actions" }).click();
    await expect(page.getByRole("menuitem").first()).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /favorite/i })).toHaveCount(
      0,
    );
  });
});

test("the logs list keeps Log descent docked in the window", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto("/logs");
  const button = page.getByRole("button", { name: "Log descent" });
  await expect(button).toBeVisible();
  const b = await button.boundingBox();
  expect(b?.y).toBeLessThan(600);
  expect((b?.y ?? 0) + (b?.height ?? 0)).toBeLessThanOrEqual(600);
});

for (const width of [768, 900, 1024, 1100]) {
  test(`map controls stay clear of the cards at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 768 });
    await page.goto("/logs/9201");
    await appReady(page);
    await expect(page.getByTestId("canvas-card-log")).toBeVisible();
    // The controls move into the free area once the cards have laid out.
    await expect
      .poll(async () => {
        const zoom = await box(page, ".maplibregl-ctrl-zoom-in");
        const cards = page.locator('[data-testid^="canvas-card-"]');
        for (let i = 0; i < (await cards.count()); i++) {
          const c = await cards.nth(i).boundingBox();
          if (!c) continue;
          const overlaps =
            zoom.x < c.x + c.width &&
            zoom.x + zoom.width > c.x &&
            zoom.y < c.y + c.height &&
            zoom.y + zoom.height > c.y;
          if (overlaps) return false;
        }
        return true;
      })
      .toBe(true);
  });
}
