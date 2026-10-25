import { expect, type Page, test } from "@playwright/test";
import { appReady, FIX } from "../support/fixture";

// A selection moves the camera by distance: 260 ms up to half a screen,
// 360 ms up to one and a half, a jump beyond; always a jump under reduced
// motion. An ease is read from the duration MapLibre holds while it runs; a
// jump from how fast the hole reaches its final place on screen.

const LOWER = `/?waterway=${FIX.waterway}&section=${FIX.sections.lower}`;
const HOLE_AT: [number, number] = [11.013, 47.013];

type MapLike = {
  jumpTo(o: { center: [number, number]; zoom: number }): void;
  project(p: [number, number]): { x: number; y: number };
  unproject(p: [number, number]): { lng: number; lat: number };
  getContainer(): HTMLElement;
  isMoving(): boolean;
  loaded(): boolean;
  on(type: "move", fn: () => void): void;
  _easeOptions?: { duration?: number };
};
type Win = {
  __paddlemateMap: MapLike;
  __asked: number;
  __samples: { t: number; x: number; y: number }[];
};

async function open(page: Page) {
  await page.goto(LOWER);
  await appReady(page);
  await page.waitForFunction(() => {
    const map = (window as unknown as Partial<Win>).__paddlemateMap;
    return !!map && map.loaded() && !map.isMoving();
  });
  await page.evaluate(() => {
    const w = window as unknown as Win;
    w.__asked = 0;
    w.__paddlemateMap.on("move", () => {
      w.__asked = Math.max(
        w.__asked,
        w.__paddlemateMap._easeOptions?.duration ?? 0,
      );
    });
  });
}

/** Park the camera `screens` widths west of the hole at zoom 14, open the hole
 * from its row, and return the duration asked for and how long the hole took
 * to reach (within 0.1 screens of) its final place. */
async function selectFrom(page: Page, screens: number) {
  await page.evaluate(
    ([at, s]) => {
      const map = (window as unknown as Win).__paddlemateMap;
      map.jumpTo({ center: at, zoom: 14 });
      const p = map.project(at);
      const width = map.getContainer().clientWidth;
      const c = map.unproject([p.x - s * width, p.y]);
      map.jumpTo({ center: [c.lng, c.lat], zoom: 14 });
    },
    [HOLE_AT, screens] as const,
  );
  await page.waitForFunction(
    () => !(window as unknown as Win).__paddlemateMap.isMoving(),
  );
  await page.evaluate(() => {
    const w = window as unknown as Win;
    w.__asked = 0;
    w.__samples = [];
    const map = w.__paddlemateMap;
    const frame = () => {
      const p = map.project([11.013, 47.013]);
      w.__samples.push({ t: performance.now(), x: p.x, y: p.y });
      if (w.__samples.length < 80) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  await page
    .locator('[data-row][data-type="hole"]')
    .filter({ visible: true })
    .first()
    .click();
  await page.waitForFunction(
    () => (window as unknown as Win).__samples.length >= 80,
  );
  return page.evaluate(() => {
    const w = window as unknown as Win;
    const el = w.__paddlemateMap.getContainer();
    const at = w.__samples;
    const last = at[at.length - 1];
    const off = (s: { x: number; y: number }) =>
      Math.max(
        Math.abs(s.x - last.x) / el.clientWidth,
        Math.abs(s.y - last.y) / el.clientHeight,
      );
    const moved = at.find(
      (s) =>
        Math.abs(s.x - at[0].x) / el.clientWidth > 0.001 ||
        Math.abs(s.y - at[0].y) / el.clientHeight > 0.001,
    );
    const start = moved;
    const reach = at.find((s) => start && s.t >= start.t && off(s) < 0.1);
    return {
      moved: !!start,
      asked: w.__asked,
      reachMs: start && reach ? reach.t - start.t : 0,
    };
  });
}

test.describe("camera selection", () => {
  for (const [screens, ms] of [
    [0.3, 260],
    [1.2, 360],
    [3, 0],
  ] as const) {
    test(`${screens} screens away takes ${ms} ms @small`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await open(page);
      const got = await selectFrom(page, screens);
      expect(got.moved).toBe(true);
      if (ms === 0) {
        expect(got.reachMs).toBeLessThan(60);
        return;
      }
      expect(Math.abs(got.asked - ms)).toBeLessThanOrEqual(40);
    });
  }

  test("reduced motion jumps", async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem("pm-motion", "reduced"),
    );
    await open(page);
    const got = await selectFrom(page, 1.2);
    expect(got.moved).toBe(true);
    expect(got.reachMs).toBeLessThan(60);
  });
});
