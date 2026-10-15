import { expect, type Page, test } from "@playwright/test";
import { appReady } from "../support/fixture";

// Area search keeps its circle in view: drawn at once at the map's centre, and
// framed in the part of the map no card or sheet covers (the free area on a
// desktop, above the peek sheet on a phone).

type MapLike = {
  isMoving(): boolean;
  loaded(): boolean;
  getZoom(): number;
  project(lngLat: [number, number]): { x: number; y: number };
};

async function waitForCircle(page: Page) {
  await expect(page).toHaveURL(/lat=.+&lon=.+&radius=10/);
  await page.waitForFunction(() => {
    const map = (window as unknown as { __paddlemateMap?: MapLike })
      .__paddlemateMap;
    return !!map && map.loaded() && !map.isMoving();
  });
}

async function circleCentre(page: Page) {
  const url = new URL(page.url());
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  return page.evaluate(
    ([lng, la]) => {
      const map = (window as unknown as { __paddlemateMap?: MapLike })
        .__paddlemateMap;
      return map?.project([lng, la]) ?? null;
    },
    [lon, lat] as const,
  );
}

const zoom = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as { __paddlemateMap?: MapLike }
      ).__paddlemateMap?.getZoom() ?? 0,
  );

test.describe("the area circle", () => {
  test("on a desktop the circle is centred in the free area", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "the canvas is the desktop's");
    await page.goto("/?mode=area");
    await appReady(page);
    await waitForCircle(page);
    const raw = await page.getByTestId("canvas-host").getAttribute("data-free");
    const [x, y, w, h] = (raw ?? "").split(",").map(Number);
    await expect
      .poll(async () => {
        const c = await circleCentre(page);
        return c
          ? Math.abs(c.x - (x + w / 2)) < 40 && Math.abs(c.y - (y + h / 2)) < 40
          : false;
      })
      .toBe(true);
  });

  test("on a phone the circle sits in the map above the sheet", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "the sheet is the phone's");
    await page.goto("/?mode=area");
    await appReady(page);
    await waitForCircle(page);
    const sheetTop =
      (await page.getByRole("region", { name: "Search" }).boundingBox())?.y ??
      0;
    await expect
      .poll(async () => {
        const c = await circleCentre(page);
        return c ? c.y > 0 && c.y < sheetTop : false;
      })
      .toBe(true);
  });

  test("a wider radius refits the camera to the circle", async ({ page }) => {
    await page.goto("/?mode=area&lat=47&lon=11&radius=10");
    await appReady(page);
    await page.waitForFunction(() => {
      const map = (window as unknown as { __paddlemateMap?: MapLike })
        .__paddlemateMap;
      return !!map && map.loaded() && !map.isMoving();
    });
    const before = await zoom(page);
    await page.getByRole("slider").filter({ visible: true }).focus();
    for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowRight");
    await expect.poll(() => zoom(page)).toBeLessThan(before);
  });
});
