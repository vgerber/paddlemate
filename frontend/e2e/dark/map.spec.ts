import { expect, type Page, test } from "@playwright/test";
import {
  contrastReport,
  lightSurfaces,
  type Scheme,
  useScheme,
} from "../support/dark";

// The map's own parts in both schemes: no colour MapLibre cannot parse, a
// canvas that follows the scheme, control glyphs that stay visible.
const SCREENS = [
  { name: "start map", path: "/" },
  { name: "section map", path: "/?waterway=9001&section=9102" },
  { name: "gauge catalog", path: "/tools/gauge-catalog" },
];

const BAD = /color expected|Could not parse color|Missing image/i;

async function ready(page: Page) {
  const canvas = page.locator("canvas.maplibregl-canvas").first();
  await expect(canvas).toBeVisible();
  // Tiles and restyle settle; the frame is read from a screenshot because
  // a WebGL canvas cannot be read back.
  await page.waitForTimeout(3000);
  return canvas;
}

/** Mean luminance (0-255) of the canvas's top-left corner, away from cards
 * and controls. */
async function cornerLuminance(page: Page) {
  const shot = await page.screenshot({
    clip: { x: 0, y: 140, width: 24, height: 24 },
  });
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes]));
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext("2d");
    if (!ctx) return 255;
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) {
      sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    }
    return sum / (d.length / 4);
  }, shot.toString("base64"));
}

test.describe("map in both schemes @small", () => {
  for (const scheme of ["light", "dark"] as Scheme[]) {
    for (const screen of SCREENS) {
      test(`${screen.name} in ${scheme}: no paint errors, canvas follows`, async ({
        page,
      }) => {
        const errors: string[] = [];
        page.on("console", (m) => {
          if (m.type() === "error" || m.type() === "warning")
            errors.push(m.text());
        });
        await useScheme(page, "system", scheme);
        await page.goto(screen.path);
        await ready(page);
        expect(errors.filter((e) => BAD.test(e))).toEqual([]);
        if (screen.name === "start map") {
          const lum = await cornerLuminance(page);
          if (scheme === "dark") expect(lum).toBeLessThan(90);
          else expect(lum).toBeGreaterThan(150);
        }
      });
    }
  }

  test("dark: control glyphs and surfaces hold", async ({ page }) => {
    await useScheme(page, "system", "dark");
    await page.goto("/?waterway=9001&section=9102");
    await ready(page);
    // Glyphs are drawn as images, so they are checked by their computed filter.
    const filters = await page.evaluate(() =>
      [
        ".maplibregl-ctrl-zoom-in .maplibregl-ctrl-icon",
        ".maplibregl-ctrl-zoom-out .maplibregl-ctrl-icon",
        ".maplibregl-ctrl-attrib-button",
      ].map((sel) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el).filter : "missing";
      }),
    );
    for (const f of filters) expect(f).toContain("invert");
    // The water level chip (dot and cm text) is D2's; everything else on the map screen
    // must sit on a dark surface.
    const light = (await lightSurfaces(page)).filter(
      (f) => !f.what.includes("MuiBox-root.css-5p64yp"),
    );
    expect(light).toEqual([]);
    const weak = (await contrastReport(page)).filter(
      (f) => !/ cm"$/.test(f.what),
    );
    expect(weak, "contrast violations").toEqual([]);
  });

  test("light: control glyphs stay as drawn", async ({ page }) => {
    await useScheme(page, "light");
    await page.goto("/");
    await ready(page);
    const filter = await page.evaluate(
      () =>
        getComputedStyle(
          document.querySelector(
            ".maplibregl-ctrl-zoom-in .maplibregl-ctrl-icon",
          ) as Element,
        ).filter,
    );
    expect(filter).toBe("none");
  });
});
