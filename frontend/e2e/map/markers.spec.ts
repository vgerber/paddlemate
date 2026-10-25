import { expect, type Page, test } from "@playwright/test";
import { appReady, FIX } from "../support/fixture";

// WP14 M8: one ring that travels between point targets, the level dot filling
// from its centre, and stale or offline gauges as hollow dots. Animations
// are held at their first frame (Element.animate is patched to pause the
// ones under test) so the spec reads the transform at a chosen time.

const LOWER = `/?waterway=${FIX.waterway}&section=${FIX.sections.lower}`;
const RIVER = `/?waterway=${FIX.waterway}`;
const PUT_IN = { id: 9521 };
const HOLE = { id: 9525 };
const GAUGE_AT = { lat: 47.011, lon: 11.011 };

type MapLike = {
  isMoving(): boolean;
  loaded(): boolean;
  project(lngLat: [number, number]): { x: number; y: number };
};
type Held = { id: string; anim: Animation; el: Element };
type Win = { __held: Held[]; __paddlemateMap?: MapLike };

const HELD_IDS = ["target-ring", "level-fill-layer"];

async function holdAnimations(page: Page) {
  await page.addInitScript((ids: string[]) => {
    const w = window as unknown as Win;
    w.__held = [];
    const orig = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const anim = orig.apply(this, args);
      const id = this.getAttribute("data-testid");
      if (id && ids.includes(id)) {
        anim.pause();
        anim.currentTime = 0;
        w.__held.push({ id, anim, el: this });
      }
      return anim;
    };
  }, HELD_IDS);
}

async function reduced(page: Page) {
  await page.addInitScript(() => localStorage.setItem("pm-motion", "reduced"));
}

/** Moves the newest held animation of `id` to `ms` and reads the element. */
function sample(page: Page, id: string, ms: number) {
  return page.evaluate(
    ([testid, t]) => {
      const held = (window as unknown as Win).__held.filter(
        (h) => h.id === testid,
      );
      const h = held.at(-1);
      if (!h) return null;
      h.anim.currentTime = t as number;
      const cs = getComputedStyle(h.el);
      const m = new DOMMatrix(
        cs.transform === "none" ? undefined : cs.transform,
      );
      const timing = h.anim.effect?.getComputedTiming();
      const frames = (h.anim.effect as KeyframeEffect).getKeyframes();
      return {
        tx: m.e,
        ty: m.f,
        scale: m.a,
        opacity: Number(cs.opacity),
        duration: Number(timing?.duration),
        props: [...new Set(frames.flatMap((f) => Object.keys(f)))].filter(
          (k) =>
            !["offset", "easing", "composite", "computedOffset"].includes(k),
        ),
        count: held.length,
      };
    },
    [id, ms] as const,
  );
}

async function ready(page: Page, isMobile: boolean) {
  await appReady(page);
  await page.waitForFunction(() => {
    const map = (window as unknown as Win).__paddlemateMap;
    return !!map && map.loaded() && !map.isMoving();
  });
  const view = page.getByRole("button", { name: "View on map" });
  if (isMobile && (await view.isVisible())) await view.click();
}

/** Opens a feature the way the router does on a tap, by an in-app history
 * step: a note pin sits on the hole's point, so a pixel tap is unreliable. */
async function selectInApp(page: Page, url: string) {
  await page.evaluate((u) => {
    window.history.pushState({}, "", u);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, url);
}

interface GaugeMock {
  level: string;
  /** Age of the newest reading. */
  ageMs: number;
}

/** The fixture's gauge has no coordinates; give it some so it has a pin. */
async function mockGauge(page: Page, cfg: GaugeMock) {
  await page.route("**/waterways/water-status?*", async (route) => {
    const res = await route.fetch();
    const json = (await res.json()) as Record<
      string,
      {
        ranges: {
          level: string;
          gauge: object;
          latest_reading: { measured_at: string } | null;
        }[];
      }
    >;
    for (const status of Object.values(json)) {
      for (const r of status.ranges) {
        r.level = cfg.level;
        Object.assign(r.gauge, GAUGE_AT);
        if (r.latest_reading) {
          r.latest_reading.measured_at = new Date(
            Date.now() - cfg.ageMs,
          ).toISOString();
        }
      }
    }
    await route.fulfill({ response: res, json });
  });
}

async function openGauges(page: Page, isMobile: boolean) {
  await page.goto(RIVER);
  await appReady(page);
  await page.getByRole("tab", { name: "Gauges" }).click();
  const view = page.getByRole("button", { name: "View on map" });
  if (isMobile && (await view.isVisible())) await view.click();
}

/** Wakes the status queries; stale ones refetch. */
const refocus = (page: Page) =>
  page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

const pin = (page: Page) => page.locator("[data-hollow]").first();

test.describe("marker motion", () => {
  test.describe.configure({ mode: "serial" });

  test("the ring travels old to new by transform and appears once", async ({
    page,
    isMobile,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await holdAnimations(page);
    await page.goto(`${LOWER}&feature=${PUT_IN.id}`);
    await ready(page, isMobile);
    await expect(page.getByTestId("target-ring")).toHaveCount(1);
    const grow = await sample(page, "target-ring", 100);
    expect(grow?.props).toEqual(
      expect.arrayContaining(["opacity", "transform"]),
    );
    await sample(page, "target-ring", 260);
    await page.evaluate(() => {
      document
        .querySelector("[data-testid=target-ring]")
        ?.setAttribute("data-first", "1");
    });
    await selectInApp(page, `${LOWER}&feature=${HOLE.id}`);
    await expect
      .poll(() => sample(page, "target-ring", 0).then((s) => s?.count))
      .toBe(2);
    const start = await sample(page, "target-ring", 0);
    const mid = await sample(page, "target-ring", 130);
    const end = await sample(page, "target-ring", 260);
    expect(start?.duration).toBe(260);
    expect(start?.props).toEqual(["transform"]);
    const dist = (s: { tx: number; ty: number } | null) =>
      Math.hypot(s?.tx ?? 0, s?.ty ?? 0);
    expect(dist(start)).toBeGreaterThan(10);
    expect(dist(mid)).toBeGreaterThan(1);
    expect(dist(mid)).toBeLessThan(dist(start));
    expect(dist(end)).toBeLessThan(0.5);
    // Still the same single element: it was moved, not faded out and in.
    await expect(page.getByTestId("target-ring")).toHaveCount(1);
    await expect(page.getByTestId("target-ring")).toHaveAttribute(
      "data-first",
      "1",
    );
    expect(mid?.opacity).toBe(1);
  });

  test("reduced: the ring jumps, its first appearance fades in 140 ms", async ({
    page,
    isMobile,
  }) => {
    await reduced(page);
    await holdAnimations(page);
    await page.goto(`${LOWER}&feature=${PUT_IN.id}`);
    await ready(page, isMobile);
    await expect(page.getByTestId("target-ring")).toHaveCount(1);
    const first = await sample(page, "target-ring", 0);
    expect(first?.props).toEqual(["opacity"]);
    expect(first?.duration).toBe(140);
    expect(first?.opacity).toBe(0);
    await selectInApp(page, `${LOWER}&feature=${HOLE.id}`);
    await expect
      .poll(() => new URL(page.url()).searchParams.get("feature"))
      .toBe(String(HOLE.id));
    expect((await sample(page, "target-ring", 0))?.count).toBe(1);
  });

  test("a level change fills the dot from its centre", async ({
    page,
    isMobile,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await holdAnimations(page);
    await page.clock.install();
    const cfg: GaugeMock = { level: "low", ageMs: 60_000 };
    await mockGauge(page, cfg);
    await openGauges(page, isMobile);
    await expect(pin(page)).toHaveAttribute("data-level", "low");
    const before = await pin(page).boundingBox();
    cfg.level = "high";
    await page.clock.fastForward("10:00");
    await expect
      .poll(async () => {
        await refocus(page);
        return pin(page).getAttribute("data-level");
      })
      .toBe("high");
    await expect
      .poll(
        async () => {
          await refocus(page);
          return (await sample(page, "level-fill-layer", 0))?.count;
        },
        { timeout: 20_000 },
      )
      .toBe(1);
    const start = await sample(page, "level-fill-layer", 0);
    const mid = await sample(page, "level-fill-layer", 130);
    expect(start?.props).toEqual(["transform"]);
    expect(start?.duration).toBe(260);
    expect(start?.scale).toBe(0);
    expect(mid?.scale).toBeGreaterThan(0);
    expect(mid?.scale).toBeLessThan(1);
    // The dot keeps its size: it is a scale on the inner layer.
    const after = await pin(page).boundingBox();
    expect(after?.width).toBeCloseTo(before?.width ?? 0, 2);
    expect(after?.height).toBeCloseTo(before?.height ?? 0, 2);
  });

  test("reduced: the new level fades in 140 ms without scaling", async ({
    page,
    isMobile,
  }) => {
    await reduced(page);
    await holdAnimations(page);
    await page.clock.install();
    const cfg: GaugeMock = { level: "low", ageMs: 60_000 };
    await mockGauge(page, cfg);
    await openGauges(page, isMobile);
    await expect(pin(page)).toHaveAttribute("data-level", "low");
    cfg.level = "high";
    await page.clock.fastForward("10:00");
    await expect
      .poll(
        async () => {
          await refocus(page);
          return (await sample(page, "level-fill-layer", 0))?.count;
        },
        { timeout: 20_000 },
      )
      .toBe(1);
    const s = await sample(page, "level-fill-layer", 0);
    expect(s?.props).toEqual(["opacity"]);
    expect(s?.duration).toBe(140);
    expect(s?.scale).toBe(1);
  });

  test("a stale reading is a hollow dot", async ({ page, isMobile }) => {
    const cfg: GaugeMock = { level: "medium", ageMs: 3 * 24 * 3_600_000 };
    await mockGauge(page, cfg);
    await openGauges(page, isMobile);
    await expect(pin(page)).toHaveAttribute("data-hollow", "true");
    const dot = await pin(page).evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, border: cs.borderTopColor };
    });
    expect(dot.bg).not.toBe(dot.border);
  });

  test("a gauge turns hollow as its reading ages, with no new data", async ({
    page,
    isMobile,
  }) => {
    await page.clock.install();
    await mockGauge(page, { level: "medium", ageMs: 60_000 });
    await openGauges(page, isMobile);
    await expect(pin(page)).toHaveAttribute("data-level", "medium");
    await expect(pin(page)).not.toHaveAttribute("data-hollow", "true");
    // Later requests hang, so only the clock can change the pin.
    await page.route(
      "**/waterways/water-status?*",
      () => new Promise(() => undefined),
    );
    await page.clock.fastForward("06:00:00");
    await expect(pin(page)).toHaveAttribute("data-hollow", "true");
  });

  test("offline turns a fresh gauge hollow, online fills it again", async ({
    page,
    context,
    isMobile,
  }) => {
    await mockGauge(page, { level: "medium", ageMs: 60_000 });
    await openGauges(page, isMobile);
    await expect(pin(page)).toHaveAttribute("data-hollow", "false");
    await context.setOffline(true);
    await expect(pin(page)).toHaveAttribute("data-hollow", "true");
    await context.setOffline(false);
    await expect(pin(page)).toHaveAttribute("data-hollow", "false");
  });
});
