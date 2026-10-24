import { expect, test } from "@playwright/test";
import { type Scheme, useScheme } from "../support/dark";

// MapLibre cannot parse a `var()`: it prints one console error per layer per
// render and draws nothing. Every map screen must paint with resolved colours.
const SCREENS = [
  { name: "map", path: "/", exposed: true },
  { name: "river", path: "/?waterway=9001&section=9102", exposed: true },
  { name: "gauge catalog", path: "/tools/gauge-catalog", exposed: false },
];

test.describe("map paint @small", () => {
  for (const scheme of ["light", "dark"] as Scheme[])
    for (const screen of SCREENS) {
      test(`${screen.name} in ${scheme} logs no paint error`, async ({
        page,
      }) => {
        await useScheme(page, "system", scheme);
        const errors: string[] = [];
        page.on("console", (msg) => {
          if (msg.type() === "error") errors.push(msg.text());
        });
        page.on("pageerror", (err) => errors.push(err.message));
        await page.goto(screen.path);
        await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
        // Layers are added and painted once the style has loaded. Only the
        // waterway map exposes its instance to tests.
        if (screen.exposed) {
          await expect
            .poll(() =>
              page.evaluate(() => {
                const map = (
                  window as unknown as {
                    __paddlemateMap?: { isStyleLoaded(): boolean };
                  }
                ).__paddlemateMap;
                return map?.isStyleLoaded() ?? false;
              }),
            )
            .toBe(true);
        }
        await page.waitForTimeout(1500);
        const paint = errors.filter((e) => /layer|var\(|parse/i.test(e));
        expect(paint).toEqual([]);
      });
    }
});
