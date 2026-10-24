import { expect, type Page, test } from "@playwright/test";
import { useScheme } from "../support/dark";
import { appReady } from "../support/fixture";

// A device flip restyles the live map: the section line changes colour within
// 250 ms and the camera stays where it was. Satellite on, then a flip, keeps
// the layers drawn without console errors.

const PATH = "/?waterway=9001&section=9102";
const DARK_RIVER = "#2f6384";

type Hook = {
  getCenter(): { lng: number; lat: number };
  getZoom(): number;
  getLayer(id: string): unknown;
  getPaintProperty(id: string, name: string): string;
  isStyleLoaded(): boolean;
};

async function openMap(page: Page, path = PATH) {
  await page.goto(path);
  await appReady(page);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { __paddlemateMap?: Hook }
        ).__paddlemateMap?.isStyleLoaded(),
      ),
    )
    .toBe(true);
}

const sectionLine = (page: Page) =>
  page.evaluate(() => {
    const map = (window as unknown as { __paddlemateMap: Hook })
      .__paddlemateMap;
    return map.getLayer("sections-line")
      ? map.getPaintProperty("sections-line", "line-color")
      : null;
  });
const camera = (page: Page) =>
  page.evaluate(() => {
    const map = (window as unknown as { __paddlemateMap: Hook })
      .__paddlemateMap;
    return { ...map.getCenter(), zoom: map.getZoom() };
  });

test.describe("map recolour @small", () => {
  test("a device flip recolours within 250 ms, camera unchanged", async ({
    page,
  }) => {
    await useScheme(page, "system", "light");
    await openMap(page);
    await page.waitForTimeout(1500);
    const before = await sectionLine(page);
    expect(before).not.toBe(DARK_RIVER);
    const cam = await camera(page);
    // Time from the media change to the new paint, measured in the page.
    await page.evaluate(() => {
      const w = window as unknown as {
        __flip: Promise<number>;
        __paddlemateMap: Hook;
      };
      const mq = matchMedia("(prefers-color-scheme: dark)");
      w.__flip = new Promise((resolve) => {
        mq.addEventListener(
          "change",
          () => {
            const t0 = performance.now();
            const tick = () => {
              const c = w.__paddlemateMap.getPaintProperty(
                "sections-line",
                "line-color",
              );
              if (c === "#2f6384") resolve(performance.now() - t0);
              else setTimeout(tick, 5);
            };
            tick();
          },
          { once: true },
        );
      });
    });
    await page.emulateMedia({ colorScheme: "dark" });
    const ms = await page.evaluate(
      () => (window as unknown as { __flip: Promise<number> }).__flip,
    );
    expect(ms).toBeLessThan(250);
    expect(await sectionLine(page)).toBe(DARK_RIVER);
    expect(await camera(page)).toEqual(cam);
  });

  test("satellite on, then a flip: layers stay, no console errors", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await useScheme(page, "system", "light");
    // The start map: on a phone a section sheet would cover the layer key.
    await openMap(page, "/");
    const key = page.getByTestId("map-layer-button");
    if (await key.count()) await key.click();
    await page.getByRole("button", { name: "Satellite", exact: true }).click();
    await page.waitForTimeout(1500);
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => sectionLine(page)).toBe(DARK_RIVER);
    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(() => sectionLine(page)).not.toBe(DARK_RIVER);
    expect(await sectionLine(page)).not.toBeNull();
    expect(
      errors.filter((e) => /color|parse|layer|style|image/i.test(e)),
    ).toEqual([]);
  });
});
