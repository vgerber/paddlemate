import { expect, test } from "@playwright/test";

// Screens that draw ghost and highlighted sections (other logged sections,
// the line a proposal replaces) add conditional layers to a source; one that
// misses the source's id makes MapLibre and React log errors.
const screens = ["/logs", "/logs/9202", "/proposals"];

for (const path of screens) {
  test(`${path} adds every map layer with its source`, async ({
    page,
  }, info) => {
    // The phone shows these as lists, without a map.
    test.skip(!info.project.name.startsWith("desktop"), "desktop canvas only");
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && /layers\.|source/i.test(m.text())) {
        errors.push(m.text());
      }
    });
    await page.goto(path);
    await page.locator(".maplibregl-canvas").first().waitFor();
    await page.waitForTimeout(2000);
    expect(errors).toEqual([]);
  });
}

test("the layers popover opens beside its key", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("desktop"), "desktop control stack");
  await page.goto("/?waterway=9001&section=9101");
  const key = page.getByTestId("map-layer-button");
  await key.click();
  const pop = page.getByTestId("map-layer-toggle");
  await expect(pop).toBeVisible();
  const k = await key.boundingBox();
  const p = await pop.boundingBox();
  if (!k || !p) throw new Error("no layout");
  // To the key's left, level with its top, not in the window's corner.
  expect(Math.abs(p.y - k.y)).toBeLessThan(4);
  expect(k.x - (p.x + p.width)).toBeGreaterThanOrEqual(0);
  expect(k.x - (p.x + p.width)).toBeLessThan(16);
});
