import { expect, test } from "@playwright/test";
import { gotoSection } from "../support/fixture";

// The header menu of a section opens a menu that has to stay on
// screen however small the screen is.

test("the section actions stay inside the screen @small", async ({ page }) => {
  await gotoSection(page, "lower");
  await page.getByRole("button", { name: "Section actions" }).click();
  const items = page.getByRole("menuitem");
  await expect(items.first()).toBeVisible();
  // The menu grows in (scale); measure it at rest, not mid-transition.
  await page
    .locator(".MuiMenu-paper")
    .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  await expect
    .poll(() =>
      page
        .locator(".MuiMenu-paper")
        .evaluate((el) => getComputedStyle(el).transform),
    )
    .toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  const view = page.viewportSize();
  if (!view) throw new Error("no viewport");
  const boxes = await items.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        label: el.textContent,
        top: r.top,
        bottom: r.bottom,
        height: r.height,
      };
    }),
  );
  expect(boxes.map((b) => b.label)).toEqual([
    "Add favorite",
    "Start descent",
    "Log descent",
    "Edit grade",
    "Delete grade",
    "Show proposed features",
  ]);
  for (const b of boxes) {
    expect(b.top, `${b.label} top`).toBeGreaterThanOrEqual(0);
    expect(b.bottom, `${b.label} bottom`).toBeLessThanOrEqual(view.height);
    expect(b.height, `${b.label} height`).toBeGreaterThanOrEqual(44);
  }
});
