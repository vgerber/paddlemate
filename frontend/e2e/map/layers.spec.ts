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
    test.skip(info.project.name !== "desktop", "desktop canvas only");
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
