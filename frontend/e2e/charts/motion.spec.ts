import { expect, type Page, test } from "@playwright/test";
import { gotoSection } from "../support/fixture";
import { mockSummary } from "./summary.mock";

// WP14 M5b: the chart follows the neighbour's height, the period options
// stagger in, a redraw reveals the line, the reading's number changes in a
// fixed cell and a stale reading is quiet.

function card(page: Page) {
  return page.locator('[data-testid="chart-card"]:visible').first();
}

async function open(page: Page) {
  await gotoSection(page, "lower");
  await expect(
    page.locator(".recharts-area-curve:visible").first(),
  ).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await mockSummary(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("chart-time-range", "7d");
    } catch {
      // storage blocked: 7d is the default
    }
  });
});

/** Steps a spacer above the chart through `heights`, letting each frame
 * settle, and reads the chart card after each step. Frame timing of a loaded
 * headless browser is too uneven to sample a live transition, so the steps
 * are the frames. */
async function sampleChart(page: Page, heights: number[]) {
  return page.evaluate(async (steps) => {
    const chart = document.querySelector<HTMLElement>(
      '[data-testid="chart-card"]',
    );
    const pane = chart?.closest<HTMLElement>('[style*="--chart-extra"]');
    if (!chart || !pane) throw new Error("no phone pane");
    const spacer = document.createElement("div");
    spacer.style.cssText = "height:0;flex-shrink:0";
    pane.prepend(spacer);
    const settle = () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => setTimeout(done, 30)),
        ),
      );
    const read = (px: number) => {
      const r = chart.getBoundingClientRect();
      return { px, h: r.height, bottom: r.bottom, top: r.top };
    };
    await settle();
    const rows = [read(0)];
    for (const px of steps) {
      spacer.style.height = `${px}px`;
      await settle();
      rows.push(read(px));
    }
    spacer.remove();
    return rows;
  }, heights);
}

const EASED = Array.from({ length: 14 }, (_, i) => {
  const t = (i + 1) / 14;
  return Math.round((t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2) * 80);
});

test.describe("the hand-over", () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== "phone", "the grow is a phone layout");
    // A tall window leaves the features pane free height to hand over.
    await page.setViewportSize({ width: 390, height: 1230 });
  });

  test("a neighbour that animates its height: the chart's lower edge stays", async ({
    page,
  }) => {
    await open(page);
    const rows = await sampleChart(page, EASED);
    const first = rows[0];
    if (!first) throw new Error("no frames");
    // The extra is shared out in the frame the neighbour changes in: the
    // chart's lower edge is the pane's, so it stays put at every step.
    for (const r of rows) {
      expect(
        Math.abs(r.bottom - first.bottom),
        `at ${r.px}px`,
      ).toBeLessThanOrEqual(1);
    }
    expect(
      rows[rows.length - 1]?.top,
      "the chart's top moved down",
    ).toBeGreaterThan(first.top);
  });

  test("the real fold: the cards' shared edge travels together", async ({
    page,
  }) => {
    // Short enough that the fold's pixels fit under the chart's cap.
    await page.setViewportSize({ width: 390, height: 1100 });
    await open(page);
    const rows = await page.evaluate(async () => {
      const q = (id: string) =>
        document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
      const features = q("features-card");
      const chart = q("chart-card");
      const fold = q("features-fold");
      if (!features || !chart || !fold) throw new Error("no cards");
      const settle = () =>
        new Promise<void>((done) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => setTimeout(done, 30)),
          ),
        );
      const read = () => ({
        featuresTop: features.getBoundingClientRect().top,
        featuresBottom: features.getBoundingClientRect().bottom,
        chartBottom: chart.getBoundingClientRect().bottom,
        h: chart.getBoundingClientRect().height,
      });
      const start = read();
      fold.click();
      await new Promise((r) => setTimeout(r, 0));
      // Hold every running transition and step it by hand: a loaded
      // browser's frames are too uneven to sample a live one.
      const running = document.getAnimations();
      for (const a of running) a.pause();
      const out = [start];
      for (let i = 1; i <= 13; i++) {
        for (const a of running) a.currentTime = (i / 13) * 260;
        await settle();
        out.push(read());
      }
      for (const a of running) a.finish();
      await settle();
      return { rows: out, animated: running.length };
    });
    expect(rows.animated, "the fold ran a transition").toBeGreaterThan(0);
    const first = rows.rows[0];
    const last = rows.rows[rows.rows.length - 1];
    if (!first || !last) throw new Error("no frames");
    let followed = 0;
    for (const r of rows.rows) {
      // The chart's lower edge meets the card's upper one, and the card's
      // foot (the pane's) stays: the chart takes the pixels the card gave.
      expect(
        Math.abs(
          r.featuresTop -
            r.chartBottom -
            (first.featuresTop - first.chartBottom),
        ),
        "the cards stay one gap apart",
      ).toBeLessThanOrEqual(1);
      // Until the chart reaches its cap (half the window), which the fold
      // can outrun in a fixture this small.
      if (r.h < last.h - 1) {
        followed++;
        expect(
          Math.abs(r.featuresBottom - first.featuresBottom),
          "the card's foot stays put",
        ).toBeLessThanOrEqual(1);
      }
    }
    expect(followed, "enough frames below the cap").toBeGreaterThan(3);
    expect(
      last.h,
      "the chart is taller by the pixels the card gave",
    ).toBeGreaterThan(first.h);
  });

  test("a step in one frame is taken in that frame", async ({ page }) => {
    await open(page);
    const rows = await sampleChart(page, [80]);
    const first = rows[0];
    if (!first) throw new Error("no frames");
    for (const r of rows) {
      expect(
        Math.abs(r.bottom - first.bottom),
        `at ${r.px}px`,
      ).toBeLessThanOrEqual(1);
    }
    expect(
      rows[rows.length - 1]?.h,
      "the chart gave the pixels up",
    ).toBeLessThan(first.h);
  });
});

async function pickPeriod(page: Page, label: string) {
  await page.locator('[aria-label$="chart period"]:visible').first().click();
  await page.getByRole("menuitem", { name: label }).click();
}

test("the period options stagger in, three rows at most", async ({ page }) => {
  await open(page);
  await page.locator('[aria-label$="chart period"]:visible').first().click();
  await expect(page.getByRole("menuitem").first()).toBeVisible();
  const delays = await page.getByRole("menuitem").evaluateAll((els) =>
    els.map((el) => {
      const style = getComputedStyle(el);
      if (style.animationName !== "pm-option-in") return -1;
      return Number.parseFloat(style.animationDelay) * 1000;
    }),
  );
  expect(delays.slice(0, 3)).toEqual([0, 40, 80]);
  expect(Math.max(...delays)).toBe(80);
});

test("the period button fills with a transition", async ({ page }) => {
  await open(page);
  const button = page.locator('[aria-label$="chart period"]:visible').first();
  const t = await button.evaluate(
    (el) => getComputedStyle(el).transitionProperty,
  );
  expect(t).toContain("background-color");
});

test("a pick reveals the new line left to right, the area after", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => {
    (window as unknown as { seen: string[] }).seen = [];
    new MutationObserver(() => {
      for (const el of document.querySelectorAll(".recharts-area-curve")) {
        for (const a of el.getAnimations()) {
          (window as unknown as { seen: string[] }).seen.push(
            (a as CSSAnimation).animationName,
          );
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
  await pickPeriod(page, "Last 24 hours");
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { seen: string[] }).seen),
    )
    .toContain("pm-line-reveal");
});

test("hovering a settled chart does not draw it in again", async ({ page }) => {
  await open(page);
  // Past the redraw window (slow + base + fast).
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    (window as unknown as { seen: string[] }).seen = [];
    new MutationObserver(() => {
      for (const el of document.querySelectorAll(".recharts-area-curve")) {
        for (const a of el.getAnimations()) {
          (window as unknown as { seen: string[] }).seen.push(
            (a as CSSAnimation).animationName,
          );
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
  const box = await page
    .locator(".recharts-area-curve:visible")
    .first()
    .boundingBox();
  if (!box) throw new Error("no line");
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(box.x + (box.width * i) / 7, box.y + box.height / 2);
    await page.waitForTimeout(80);
  }
  const seen = await page.evaluate(
    () => (window as unknown as { seen: string[] }).seen,
  );
  expect(seen).not.toContain("pm-line-reveal");
});

test("reduced: a pick cross-fades and does not draw the line in", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("pm-motion", "reduced"));
  await open(page);
  await page.evaluate(() => {
    (window as unknown as { seen: string[] }).seen = [];
    new MutationObserver(() => {
      for (const el of document.querySelectorAll(".recharts-area-curve")) {
        for (const a of el.getAnimations()) {
          (window as unknown as { seen: string[] }).seen.push(
            (a as CSSAnimation).animationName,
          );
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
  await pickPeriod(page, "Last 24 hours");
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { seen: string[] }).seen),
    )
    .toContain("pm-area-in");
  const seen = await page.evaluate(
    () => (window as unknown as { seen: string[] }).seen,
  );
  expect(seen).not.toContain("pm-line-reveal");
});

test("the reading number sits in a fixed tabular cell", async ({ page }) => {
  await open(page);
  const cell = card(page).getByTestId("reading-number");
  expect(await cell.evaluate((el) => getComputedStyle(el).display)).toBe(
    "inline-block",
  );
  expect(
    await cell
      .locator("span")
      .first()
      .evaluate((el) => getComputedStyle(el).fontVariantNumeric),
  ).toContain("tabular-nums");
});

test("a stale reading: value at 60%, a dashed neutral pill", async ({
  page,
}) => {
  await page.route(/\/water-status(\?|$)/, async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    const old = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const statuses: {
      ranges: { latest_reading?: { measured_at: string } }[];
    }[] = route.request().url().includes("section_ids")
      ? Object.values(body)
      : [body];
    for (const s of statuses)
      for (const r of s.ranges)
        if (r.latest_reading) r.latest_reading.measured_at = old;
    await route.fulfill({ response: res, json: body });
  });
  await gotoSection(page, "lower");
  const c = card(page);
  const pill = c.getByTestId("reading-level-stale");
  await expect(pill).toBeVisible();
  const dot = pill.locator("div, span").first();
  expect(await dot.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe(
    "dashed",
  );
  const value = c.getByTestId("reading-number").locator("span").first();
  expect(await value.evaluate((el) => getComputedStyle(el).opacity)).toBe(
    "0.6",
  );
});

test("the reading skeleton holds the number's height", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "phone",
    "the rail has no card while loading",
  );
  await page.route(/\/water-status(\?|$)/, async (route) => {
    await new Promise((r) => setTimeout(r, 8000));
    await route.continue().catch(() => undefined);
  });
  await gotoSection(page, "lower");
  const skeleton = page.getByTestId("reading-skeleton").first();
  await expect(skeleton).toBeVisible();
  const h = await skeleton.evaluate((e) => e.getBoundingClientRect().height);
  expect(h).toBeGreaterThanOrEqual(36);
});

test("the gauge card and the features card share their edges", async ({
  page,
}) => {
  await open(page);
  const edges = async (id: string) =>
    page
      .locator(`[data-testid="${id}"]:visible`)
      .first()
      .evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right };
      });
  const features = await edges("features-card");
  const chart = await edges("chart-card");
  expect(Math.abs(chart.left - features.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(chart.right - features.right)).toBeLessThanOrEqual(1);
});

test.describe("the wheel over the chart", () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "a mouse wheel needs a mouse");
    await page.setViewportSize({ width: 600, height: 800 });
  });

  test("a plain wheel scrolls the pane and leaves the chart alone", async ({
    page,
  }) => {
    await open(page);
    const plot = page.locator('[data-testid="chart-plot"]:visible').first();
    const box = await plot.boundingBox();
    if (!box) throw new Error("no plot");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const pane = page.getByTestId("tab-pane");
    expect(await pane.evaluate((el) => el.scrollTop)).toBe(0);
    await page.mouse.wheel(0, 200);
    await expect
      .poll(() => page.getByTestId("tab-pane").evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    await expect(page.getByRole("button", { name: "Reset zoom" })).toHaveCount(
      0,
    );
  });

  test("ctrl + wheel zooms", async ({ page }) => {
    await open(page);
    const plot = page.locator('[data-testid="chart-plot"]:visible').first();
    const box = await plot.boundingBox();
    if (!box) throw new Error("no plot");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -300);
    await page.keyboard.up("Control");
    await expect(
      page.getByRole("button", { name: "Reset zoom" }),
    ).toBeVisible();
  });
});

for (const width of [600, 1000, 1280]) {
  test.describe(`at ${width}px wide`, () => {
    test.beforeEach(async ({ page }, info) => {
      test.skip(info.project.name !== "desktop", "a wide-window check");
      await page.setViewportSize({ width, height: 800 });
    });

    test("the gauge card and the features card share their edges", async ({
      page,
    }) => {
      await open(page);
      const edges = (id: string) =>
        page
          .locator(`[data-testid="${id}"]:visible`)
          .first()
          .evaluate((el) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, right: r.right };
          });
      const features = await edges("features-card");
      const chart = await edges("chart-card");
      expect(Math.abs(chart.left - features.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(chart.right - features.right)).toBeLessThanOrEqual(1);
    });

    test("a plain wheel over the chart is left to the page", async ({
      page,
    }) => {
      await open(page);
      const prevented = await page.evaluate(() => {
        const el = document.querySelector(
          '[role="group"][aria-roledescription="chart"]',
        );
        if (!el) throw new Error("no chart");
        const wheel = (ctrlKey: boolean) => {
          const ev = new WheelEvent("wheel", {
            deltaY: -200,
            ctrlKey,
            cancelable: true,
            bubbles: true,
          });
          el.dispatchEvent(ev);
          return ev.defaultPrevented;
        };
        return { plain: wheel(false), ctrl: wheel(true) };
      });
      expect(prevented).toEqual({ plain: false, ctrl: true });
    });
  });
}
