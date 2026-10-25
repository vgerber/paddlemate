import { expect, type Page, test } from "@playwright/test";
import { appReady, FIX } from "../support/fixture";

// WP14 M2: the flow along the selected section (12 frames at 12 Hz), the
// section drawing itself in (360 ms), the first-load fade (260 ms) and the
// policy that stops ambient motion. The map is read through the test handle
// (`__paddlemateMap`); a counted setPaintProperty is the flow's frame count.

const UPPER = `/?waterway=${FIX.waterway}&section=${FIX.sections.upper}`;

type Rec = {
  dash: [number, string][];
  draw: { t: number; p: number; main: string }[];
  fade: { t: number; o: number; d: string }[];
  drawEnd?: number;
};
type MapLike = {
  getLayer(id: string): unknown;
  getLayoutProperty(id: string, prop: string): unknown;
  getPaintProperty(id: string, prop: string): unknown;
  getFilter(id: string): unknown;
  setPaintProperty(...args: unknown[]): unknown;
};
type Win = {
  __paddlemateMap?: MapLike;
  __paddlemateMotion?: {
    cover(on: boolean): void;
    software(on: boolean | null): void;
  };
  __rec: Rec;
};

/** Records, from the first frame: the draw-in gradient head, the map surface
 * opacity, and every dash pattern set on any layer. */
async function record(page: Page) {
  await page.addInitScript(() => {
    const rec: Rec = { dash: [], draw: [], fade: [] };
    (window as unknown as Win).__rec = rec;
    let patched = false;
    const tick = () => {
      const w = window as unknown as Win;
      const map = w.__paddlemateMap;
      const surface = document.querySelector("[data-testid=map-root]");
      if (surface && rec.fade.length < 400) {
        const o = Number(getComputedStyle(surface).opacity);
        if (rec.fade.at(-1)?.o !== 1) {
          rec.fade.push({
            t: performance.now(),
            o,
            d: getComputedStyle(surface).transitionDuration,
          });
        }
      }
      if (map && !patched) {
        patched = true;
        const orig = map.setPaintProperty.bind(map);
        map.setPaintProperty = (...args: unknown[]) => {
          if (args[1] === "line-dasharray") {
            rec.dash.push([performance.now(), String(args[0])]);
          }
          return orig(...args);
        };
      }
      if (map?.getLayer("section-drawin-line")) {
        const vis = map.getLayoutProperty("section-drawin-line", "visibility");
        if (vis !== "visible" && rec.draw.length > 0 && !rec.drawEnd) {
          rec.drawEnd = performance.now();
        }
        if (vis === "visible") {
          const g = map.getPaintProperty(
            "section-drawin-line",
            "line-gradient",
          ) as unknown[];
          rec.draw.push({
            t: performance.now(),
            p: Number(g[3]),
            main: String(
              map.getLayoutProperty("sections-line-selected", "visibility"),
            ),
          });
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** `software` false lifts the software-GL pause, which this headless Chrome
 * (SwiftShader) always has; null leaves the real detection. */
async function open(page: Page, url = UPPER, software: boolean | null = false) {
  await page.goto(url);
  await appReady(page);
  await page.waitForFunction(
    () =>
      !!(window as unknown as Win).__paddlemateMap?.getLayer("sections-flow") &&
      !!(window as unknown as Win).__paddlemateMotion,
  );
  await page.evaluate(
    (on) => (window as unknown as Win).__paddlemateMotion?.software(on),
    software,
  );
}

/** Frame times of the flow layer so far. */
const flowTimes = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as Win).__rec.dash
      .filter(([, id]) => id === "sections-flow")
      .map(([t]) => t),
  );
const dashLayers = (page: Page) =>
  page.evaluate(() => [
    ...new Set((window as unknown as Win).__rec.dash.map(([, id]) => id)),
  ]);
const drawDone = (page: Page) =>
  page.waitForFunction(
    () => {
      const w = window as unknown as Win;
      return (
        w.__rec.draw.length > 0 &&
        w.__paddlemateMap?.getLayoutProperty(
          "section-drawin-line",
          "visibility",
        ) === "none"
      );
    },
    undefined,
    { timeout: 5000 },
  );
/** Flow frames set during the next `ms`. */
async function framesIn(page: Page, ms: number) {
  const before = (await flowTimes(page)).length;
  await page.waitForTimeout(ms);
  return (await flowTimes(page)).length - before;
}

test.describe("map motion", () => {
  test.describe.configure({ mode: "serial" });

  test("the flow runs at 12 Hz on the selected section only", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    // A fake clock, running at real speed until paused: software rendering
    // makes real frames too slow to count the 12 Hz gate (each repaint costs
    // the main thread ~100 ms here), so the last two seconds are stepped.
    test.setTimeout(90_000);
    await page.clock.install();
    await record(page);
    await open(page);
    await drawDone(page);
    await page.clock.pauseAt(
      await page.evaluate(() => new Date(Date.now() + 200)),
    );
    const before = (await flowTimes(page)).length;
    await page.clock.runFor(2000);
    const n = (await flowTimes(page)).length - before;
    expect(n).toBeGreaterThanOrEqual(2 * 12 - 2);
    expect(n).toBeLessThanOrEqual(2 * 12 + 2);
    // One animated object: no other layer ever takes a dash pattern.
    expect(await dashLayers(page)).toEqual(["sections-flow"]);
    const filter = await page.evaluate(() =>
      JSON.stringify(
        (window as unknown as Win).__paddlemateMap?.getFilter("sections-flow"),
      ),
    );
    expect(filter).toContain(String(FIX.sections.upper));
  });

  test("software-rendered GL requests no flow frames", async ({ page }) => {
    await record(page);
    await open(page, UPPER, null);
    await drawDone(page);
    expect(await framesIn(page, 1000)).toBe(0);
    await page.evaluate(() =>
      (window as unknown as Win).__paddlemateMotion?.software(false),
    );
    expect(await framesIn(page, 700)).toBeGreaterThan(3);
  });

  test("it stops when the tab is hidden and resumes", async ({ page }) => {
    await record(page);
    await open(page);
    await drawDone(page);
    expect(await framesIn(page, 500)).toBeGreaterThan(0);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(100);
    expect(await framesIn(page, 700)).toBe(0);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => false,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(await framesIn(page, 700)).toBeGreaterThan(3);
  });

  test("it stops when an overlay covers the map and resumes", async ({
    page,
  }) => {
    await record(page);
    await open(page);
    await drawDone(page);
    await page.waitForFunction(
      () => !!(window as unknown as Win).__paddlemateMotion,
    );
    await page.evaluate(() =>
      (window as unknown as Win).__paddlemateMotion?.cover(true),
    );
    await page.waitForTimeout(100);
    expect(await framesIn(page, 700)).toBe(0);
    await page.evaluate(() =>
      (window as unknown as Win).__paddlemateMotion?.cover(false),
    );
    expect(await framesIn(page, 700)).toBeGreaterThan(3);
  });

  test("it stops after 20 s without input and input wakes it", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await record(page);
    await open(page);
    await drawDone(page);
    expect(await framesIn(page, 500)).toBeGreaterThan(0);
    await page.waitForTimeout(20_500);
    expect(await framesIn(page, 800)).toBe(0);
    await page.evaluate(() => window.dispatchEvent(new Event("pointermove")));
    expect(await framesIn(page, 700)).toBeGreaterThan(3);
  });

  for (const battery of [
    { level: 0.15, charging: false, runs: false },
    { level: 0.15, charging: true, runs: true },
    { level: 0.5, charging: false, runs: true },
  ]) {
    test(`battery at ${battery.level * 100}%, ${battery.charging ? "charging" : "not charging"}: the flow ${battery.runs ? "runs" : "stops"}`, async ({
      page,
    }) => {
      await page.addInitScript((b) => {
        Object.assign(navigator, {
          getBattery: async () =>
            Object.assign(new EventTarget(), {
              level: b.level,
              charging: b.charging,
            }),
        });
      }, battery);
      await record(page);
      await open(page);
      await drawDone(page);
      await page.waitForTimeout(300);
      const n = await framesIn(page, 1000);
      if (battery.runs) expect(n).toBeGreaterThan(3);
      else expect(n).toBe(0);
    });
  }

  for (const how of ["the switch", "System with a reduced device"] as const) {
    test(`reduced motion (${how}): no flow, no draw-in, a short fade`, async ({
      page,
    }) => {
      if (how === "the switch") {
        await page.addInitScript(() =>
          localStorage.setItem("pm-motion", "reduced"),
        );
      } else {
        // The device setting counts only when the app is set to System.
        await page.addInitScript(() =>
          localStorage.setItem("pm-motion", "system"),
        );
        await page.emulateMedia({ reducedMotion: "reduce" });
      }
      await record(page);
      await open(page);
      await page.waitForTimeout(2000);
      expect((await flowTimes(page)).length).toBe(0);
      const state = await page.evaluate(() => {
        const w = window as unknown as Win;
        const map = w.__paddlemateMap;
        return {
          flow: map?.getLayoutProperty("sections-flow", "visibility"),
          drew: w.__rec.draw.length,
          main: map?.getLayoutProperty("sections-line-selected", "visibility"),
        };
      });
      expect(state).toEqual({ flow: "none", drew: 0, main: "visible" });
      const fade = await page.evaluate(
        () => (window as unknown as Win).__rec.fade,
      );
      expect(fade[0]?.o).toBe(0);
      expect(fade.at(-1)?.o).toBe(1);
      expect(fade.at(-1)?.d).toBe("0.14s");
    });
  }

  test("a newly selected section draws in over 360 ms, then the flow starts", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    // Stepped by hand at 16 ms: real frames are too slow here to time 360 ms.
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 50));
    await record(page);
    await page.goto(UPPER);
    // The paused clock stalls the page, so the override is set as it steps.
    const lift = () =>
      page.evaluate(() =>
        (window as unknown as Win).__paddlemateMotion?.software(false),
      );
    const state = () =>
      page.evaluate(() => {
        const w = window as unknown as Win;
        const map = w.__paddlemateMap;
        const vis = map?.getLayer("section-drawin-line")
          ? map.getLayoutProperty("section-drawin-line", "visibility")
          : "none";
        const g = map?.getPaintProperty(
          "section-drawin-line",
          "line-gradient",
        ) as unknown[] | undefined;
        return {
          vis,
          p: Number(g?.[3] ?? 0),
          flow: w.__rec.dash.length,
          main: map?.getLayoutProperty("sections-line-selected", "visibility"),
        };
      });
    // Run until the head leaves the put-in.
    let now = await state();
    for (let i = 0; i < 2000 && now.vis !== "visible"; i++) {
      await page.clock.runFor(16);
      await page.waitForTimeout(20);
      await lift();
      now = await state();
    }
    expect(now.vis).toBe("visible");
    const steps: {
      at: number;
      vis: unknown;
      p: number;
      main: unknown;
      flow: number;
    }[] = [];
    for (let at = 0; at <= 480; at += 16) {
      await page.clock.runFor(16);
      steps.push({ at, ...(await state()) });
    }
    const doneAt = steps.find((s) => s.vis === "none")?.at ?? Number.NaN;
    expect(doneAt).toBeGreaterThanOrEqual(340);
    expect(doneAt).toBeLessThanOrEqual(400);
    const drawn = steps.filter((s) => s.vis === "visible");
    for (let i = 1; i < drawn.length; i++) {
      expect(drawn[i]?.p ?? 0).toBeGreaterThanOrEqual(drawn[i - 1]?.p ?? 0);
    }
    const near = (ms: number) =>
      drawn.reduce((a, d) =>
        Math.abs(d.at - ms) < Math.abs(a.at - ms) ? d : a,
      );
    // The in-out token curve: eased out of the put-in, half way near a
    // third of the time, settled well before the take-out.
    expect(near(48).p).toBeLessThan(0.15);
    expect(near(112).p).toBeGreaterThan(0.4);
    expect(near(112).p).toBeLessThan(0.6);
    expect(near(320).p).toBeGreaterThan(0.95);
    // The plain selected line waits for the draw-in, then takes over.
    expect(drawn.every((s) => s.main === "none")).toBe(true);
    expect(steps.at(-1)?.main).toBe("visible");
    // One animated object at a time: no flow frame before the draw-in ends.
    expect(drawn.at(-1)?.flow).toBe(0);
    expect(steps.at(-1)?.flow).toBeGreaterThan(0);
  });

  test("the map fades in once on first load, over 260 ms", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await record(page);
    await open(page);
    await page.waitForTimeout(600);
    const fade = await page.evaluate(
      () => (window as unknown as Win).__rec.fade,
    );
    expect(fade[0]?.o).toBe(0);
    expect(fade.at(-1)?.o).toBe(1);
    expect(fade.at(-1)?.d).toBe("0.26s");
  });
});
