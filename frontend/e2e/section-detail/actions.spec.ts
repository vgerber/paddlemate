import { expect, test } from "@playwright/test";
import { gotoSection } from "../support/fixture";

// The header menu of a section opens a menu that has to stay on
// screen however small the screen is.

test("the section actions stay inside the screen @small", async ({ page }) => {
  await gotoSection(page, "lower");
  await page.getByRole("button", { name: "Section actions" }).click();
  const items = page.getByRole("menuitem");
  await expect(items.first()).toBeVisible();
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
    "Show proposed features",
    "Start descent",
    "Log descent",
  ]);
  for (const b of boxes) {
    expect(b.top, `${b.label} top`).toBeGreaterThanOrEqual(0);
    expect(b.bottom, `${b.label} bottom`).toBeLessThanOrEqual(view.height);
    expect(b.height, `${b.label} height`).toBeGreaterThanOrEqual(44);
  }
});
