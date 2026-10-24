import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  appReady,
  computed,
  expectNoHorizontalOverflow,
  expectTouchTargets,
  FIX,
  gotoSection,
} from "../support/fixture";
import { mockSummary } from "./summary.mock";

// WP5: the phone's chart card, the gauge cards and the credit line
// (doc/plans/ui-overhaul/calm-design.html, "A chart that opens for its
// options"), and the desktop's reading block and rail. The fixture gauge reads
// about 85 cm with thresholds 60/80/120.

function card(page: Page) {
  return page.locator('[data-testid="chart-card"]:visible').first();
}

/** The pseudo element is only a hit area if nothing clips it: a point 18px
 * above and below each link's centre must still land on the link. */
async function expectLinksHitAbove(links: Locator) {
  const hit = await links.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      const x = r.x + r.width / 2;
      return [-18, 18].map(
        (dy) => document.elementFromPoint(x, r.y + r.height / 2 + dy) === el,
      );
    }),
  );
  expect(hit.flat().every(Boolean), "links catch the pointer 18px off").toBe(
    true,
  );
}

async function openSection(page: Page) {
  await gotoSection(page, "lower");
  await expect(card(page)).toBeVisible();
  await expect(
    card(page).getByTestId("latest-dot"),
    "chart drawn (reseed readings if old)",
  ).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  // The summary route is not on the shared API yet.
  await mockSummary(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("chart-time-range", "7d");
    } catch {
      // storage blocked: the default is 7d anyway
    }
  });
});

test.describe("phone card", () => {
  test.skip(({ isMobile }) => !isMobile, "the phone's chart card");

  const withFlow = async (page: Page) => {
    await page.route(/\/water-status$/, async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      const level = body.ranges[0];
      if (!level) return route.fulfill({ response: res, json: body });
      body.ranges = [
        ...body.ranges,
        {
          ...level,
          id: 99001,
          series: {
            ...level.series,
            id: 99401,
            measurement_type: "discharge",
            unit: "m3/s",
          },
          range_low: null,
          range_medium: null,
          range_high: null,
          latest_reading: {
            ...level.latest_reading,
            series_id: 99401,
            value: 12.4,
          },
        },
      ];
      await route.fulfill({ response: res, json: body });
    });
    await page.route(/\/series\/99401\/readings/, (route) =>
      route.fulfill({
        json: { bucket_seconds: 0, from: "", to: "", items: [] },
      }),
    );
  };

  test("the head shows the latest reading, its level and when", async ({
    page,
  }) => {
    await openSection(page);
    const head = card(page).getByTestId("reading-block");
    await expect(head.getByTestId("reading-value")).toContainText(
      /^\d+(\.\d)?\s*cm$/,
    );
    await expect(head.getByTestId("reading-level")).toContainText(
      /Low|Medium|High/,
    );
    await expect(head.getByTestId("reading-time")).toContainText(
      /^\d{2}:\d{2} · .+ago$/,
    );
  });

  test("the old controls are gone: no sliders, pill, chips or H 70 labels", async ({
    page,
  }) => {
    await openSection(page);
    await expect(
      card(page).getByRole("button", { name: "Chart options" }),
    ).toHaveCount(0);
    await expect(card(page).getByTestId("chart-outline")).toHaveCount(0);
    await expect(card(page).getByTestId("chart-option-chip")).toHaveCount(0);
    await expect(card(page)).not.toContainText(/\b[HML] \d/);
  });

  test("thresholds are always drawn as the words Low, Medium, High", async ({
    page,
  }) => {
    await openSection(page);
    await expect(card(page).getByTestId("threshold-label")).toHaveText([
      "High",
      "Medium",
      "Low",
    ]);
  });

  test("the period is one quiet text button that opens the five-item menu", async ({
    page,
  }) => {
    await openSection(page);
    const period = card(page).getByRole("button", { name: "Chart period" });
    await expect(period).toContainText("Last 7 days");
    await expectTouchTargets(period);
    await period.click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem")).toHaveCount(5);
    await menu.getByRole("menuitem", { name: "Last 30 days" }).click();
    await expect(period).toContainText("Last 30 days");
  });

  test("the credit sits left of the period, one small grey line", async ({
    page,
  }) => {
    await openSection(page);
    const credit = card(page).getByTestId("gauge-attribution").first();
    await expect(credit).toContainText("Data: THS · CC BY 4.0");
    expect(await computed(credit, "font-size")).toBe("12px");
    expect(await computed(credit, "color")).toBe("rgb(88, 102, 109)");
    const link = credit.getByRole("link").first();
    expect(await computed(link, "color")).toBe("rgb(88, 102, 109)");
    const c = (await credit.boundingBox()) as NonNullable<
      Awaited<ReturnType<typeof credit.boundingBox>>
    >;
    const p = (await card(page)
      .getByRole("button", { name: "Chart period" })
      .boundingBox()) as typeof c;
    expect(c.x, "credit at the left, period at the right").toBeLessThan(p.x);
    expect(c.height, "one line").toBeLessThanOrEqual(20);
  });

  test("the credit's links are 44px to hit", async ({ page }) => {
    await openSection(page);
    const links = card(page).getByTestId("gauge-attribution").getByRole("link");
    expect(await links.count()).toBeGreaterThan(0);
    // The link is 12px type; its hit area is the pseudo element around it.
    const hits = await links.evaluateAll((els) =>
      els.map((el) => {
        const after = getComputedStyle(el, "::after");
        return {
          w: Number.parseFloat(after.width),
          h: Number.parseFloat(after.height),
        };
      }),
    );
    for (const h of hits) {
      expect(h.w).toBeGreaterThanOrEqual(44);
      expect(h.h).toBeGreaterThanOrEqual(44);
    }
    await expectLinksHitAbove(links);
  });

  test("threshold labels sit short of the latest reading's dot", async ({
    page,
  }) => {
    await openSection(page);
    const { dot, labels } = await card(page).evaluate((el) => {
      const rect = (e: Element) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, text: e.textContent };
      };
      const d = el.querySelector('[data-testid="latest-dot"]');
      return {
        dot: d ? rect(d) : null,
        labels: [...el.querySelectorAll('[data-testid="threshold-label"]')].map(
          rect,
        ),
      };
    });
    expect(dot, "latest dot drawn").not.toBeNull();
    const d = dot as NonNullable<typeof dot>;
    for (const b of labels) {
      expect(b.x + b.w, `${b.text} ends before the dot`).toBeLessThan(d.x);
    }
  });

  test("a tap shows that point's value in the plot; the head stays", async ({
    page,
  }) => {
    await openSection(page);
    const value = card(page).getByTestId("reading-value");
    const latest = await value.innerText();
    const plot = (await card(page)
      .getByTestId("chart-plot")
      .boundingBox()) as NonNullable<
      Awaited<ReturnType<ReturnType<typeof card>["boundingBox"]>>
    >;
    await page.mouse.click(plot.x + plot.width / 3, plot.y + plot.height / 2);
    await expect(card(page).getByTestId("chart-readout")).toContainText(
      /\d+(\.\d)? cm/,
    );
    await expect(value).toHaveText(latest);
  });

  test("a section's card has no close mark and no gauge name for one gauge", async ({
    page,
  }) => {
    await openSection(page);
    await expect(
      card(page).getByRole("button", { name: "Close gauge chart" }),
    ).toHaveCount(0);
    await expect(
      card(page).getByRole("button", { name: /^Gauge:/ }),
    ).toHaveCount(0);
    await expect(
      card(page).getByRole("group", { name: "Reading" }),
    ).toHaveCount(0);
  });

  test("a gauge with flow offers Level | Flow, and Flow switches the head", async ({
    page,
  }) => {
    await withFlow(page);
    await openSection(page);
    const choice = card(page).getByRole("group", { name: "Reading" });
    await expect(choice.getByRole("button")).toHaveText(["Level", "Flow"]);
    await choice.getByRole("button", { name: "Flow" }).click();
    await expect(card(page).getByTestId("reading-value")).toContainText("12.4");
  });

  test("the chart fills the card edge to edge", async ({ page }) => {
    await openSection(page);
    const c = (await card(page).boundingBox()) as NonNullable<
      Awaited<ReturnType<ReturnType<typeof card>["boundingBox"]>>
    >;
    const svg = (await card(page)
      .locator("svg.recharts-surface")
      .boundingBox()) as NonNullable<typeof c>;
    expect(svg.x).toBeLessThanOrEqual(c.x + 1);
    expect(svg.x + svg.width).toBeGreaterThanOrEqual(c.x + c.width - 1);
  });

  test("the section screen never scrolls sideways @small", async ({ page }) => {
    await openSection(page);
    await expectNoHorizontalOverflow(page);
    const c = (await card(page).boundingBox()) as NonNullable<
      Awaited<ReturnType<ReturnType<typeof card>["boundingBox"]>>
    >;
    expect(c.x + c.width).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
  });
});

test.describe("gauge cards", () => {
  test("the river's gauges are cards with the reading", async ({ page }) => {
    await page.goto("/?waterway=9001");
    await appReady(page);
    await page
      .getByRole("tab", { name: "Gauges" })
      .locator("visible=true")
      .first()
      .click();
    const cards = page.locator('[data-testid="gauge-card"]:visible');
    await expect(cards.first()).toBeVisible();
    const first = cards.first();
    expect(await computed(first, "background-color")).toBe(
      "rgb(255, 255, 255)",
    );
    expect(
      Number.parseFloat(await computed(first, "border-top-left-radius")),
    ).toBeGreaterThanOrEqual(10);
    await expect(first).toContainText("Test Gauge");
    await expect(first).toContainText(/\d+(\.\d)? cm/);
    await expect(first).toContainText("Data: THS · CC BY 4.0");
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("gauge coverage", () => {
  test("the legend is a calm card and its rows are 44px @small", async ({
    page,
  }) => {
    await page.goto("/tools/gauge-catalog");
    await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
    const legend = page.getByTestId("gauge-legend");
    await expect(legend).toBeVisible();
    expect(
      Number.parseFloat(await computed(legend, "border-top-left-radius")),
    ).toBeGreaterThanOrEqual(10);
    await expectTouchTargets(legend.getByRole("button"));
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("gauge coverage design", () => {
  test("the legend is a 250px card with the design's type and colours", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "desktop", "the phone folds the legend");
    await page.goto("/tools/gauge-catalog");
    const legend = page.getByTestId("gauge-legend");
    await expect(legend).toBeVisible();
    expect((await legend.boundingBox())?.width).toBe(250);
    expect(await computed(legend, "padding")).toBe("12px 14px");
    const title = legend.getByText("Gauges", { exact: true });
    expect(await computed(title, "font-size")).toBe("14px");
    expect(await computed(title, "font-weight")).toBe("700");
    const label = legend.getByText("Tracked", { exact: true });
    expect(await computed(label, "font-size")).toBe("14px");
    expect(await computed(label, "font-weight")).toBe("600");
    const dots = legend.locator("button > div:first-child");
    expect(await computed(dots.nth(1), "background-color")).toBe(
      "rgb(35, 109, 152)",
    );
    expect(await computed(dots.nth(2), "background-color")).toBe(
      "rgb(154, 165, 170)",
    );
    expect((await dots.nth(0).boundingBox())?.width).toBe(10);
  });

  test("on a desktop the map sits in a rounded card inset 12px", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "desktop", "the phone map is edge to edge");
    await page.goto("/tools/gauge-catalog");
    const frame = page.getByTestId("gauge-legend").locator("xpath=../..");
    expect(await computed(frame, "border-top-left-radius")).toBe("16px");
    const map = await page.locator("canvas.maplibregl-canvas").boundingBox();
    const inner = await frame.boundingBox();
    expect(inner?.x).toBe(12);
    expect(map?.width).toBeLessThanOrEqual(1280 - 24);
  });

  test("a phone folds the legend to a one-line chip that opens @small", async ({
    page,
  }, info) => {
    test.skip(info.project.name === "desktop", "phone only");
    await page.goto("/tools/gauge-catalog");
    const legend = page.getByTestId("gauge-legend");
    await expect(legend).toBeVisible();
    const chip = legend.getByRole("button", { name: /Gauges/ });
    await expect(chip).toBeVisible();
    expect((await legend.boundingBox())?.width).toBeLessThan(160);
    await expectTouchTargets(chip);
    await chip.click();
    await expect(legend.getByText("Untracked")).toBeVisible();
    await expectTouchTargets(legend.getByRole("button"));
    await expectNoHorizontalOverflow(page);
    await legend.getByRole("button", { name: "Fold the legend" }).click();
    await expect(legend.getByText("Untracked")).toHaveCount(0);
  });

  test("a cluster draws only its tracked arcs on a white disc, count in bold", async ({
    page,
  }) => {
    await page.goto("/tools/gauge-catalog");
    const donuts = page.locator('svg[aria-label$=" gauges"]');
    await expect(donuts.first()).toBeVisible({ timeout: 20_000 });
    const greys = await donuts
      .first()
      .locator("path, circle")
      .evaluateAll(
        (els) => els.filter((e) => e.getAttribute("fill") === "#9aa5aa").length,
      );
    expect(greys, "untracked is not drawn as a ring").toBe(0);
    const disc = donuts.first().locator("circle").first();
    await expect(disc).toHaveAttribute("fill", "#ffffff");
    await expect(donuts.first().locator("text")).toHaveAttribute(
      "font-weight",
      "700",
    );
  });
});

test.describe("design gaps", () => {
  test.skip(({ isMobile }) => !isMobile, "the phone's chart card");
  test("the card sits 12px from the edge", async ({ page }, info) => {
    test.skip(info.project.name === "desktop", "phone margins");
    await openSection(page);
    const box = await card(page).boundingBox();
    expect(box?.x).toBe(12);
  });

  test("the area fades to nothing and no descent bar is drawn", async ({
    page,
  }) => {
    await openSection(page);
    const last = card(page).locator("linearGradient stop").last();
    await expect(last).toHaveAttribute("stop-opacity", "0");
    const marks = await card(page)
      .locator(".recharts-reference-area rect")
      .evaluateAll(
        (els) => els.filter((e) => e.getAttribute("stroke") !== "none").length,
      );
    expect(marks, "only threshold bands, no descent bar").toBe(0);
  });

  test("the plot keeps 96px of height on a small screen @small", async ({
    page,
  }, info) => {
    test.skip(info.project.name === "desktop", "phone height");
    await openSection(page);
    const plot = await card(page).getByTestId("chart-plot").boundingBox();
    expect(plot?.height).toBeGreaterThanOrEqual(96);
  });
});

test.describe("reading block and rail", () => {
  test.skip(({ isMobile }) => isMobile, "the rail is a desktop layout");

  const block = (page: Page) => page.getByTestId("reading-block");
  const rail = (page: Page) => page.getByTestId("chart-dock");
  const plot = (page: Page) => rail(page).getByTestId("chart-plot");

  async function openRail(page: Page) {
    await gotoSection(page, "lower");
    await expect(rail(page).getByTestId("latest-dot")).toBeVisible();
  }

  async function boxOf(locator: Locator) {
    return (await locator.boundingBox()) as NonNullable<
      Awaited<ReturnType<Locator["boundingBox"]>>
    >;
  }

  /** The menu grows in; measure it once it stopped. */
  async function settled(locator: Locator) {
    await expect
      .poll(async () => (await locator.boundingBox())?.height ?? 0)
      .toBeGreaterThanOrEqual(44);
  }

  async function pointAt(page: Page, fraction: number) {
    const b = await boxOf(plot(page));
    await page.mouse.move(b.x + b.width * fraction, b.y + b.height / 2);
  }

  async function withFlow(page: Page) {
    await page.route(/\/water-status$/, async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      const level = body.ranges[0];
      if (!level) return route.fulfill({ response: res, json: body });
      body.ranges = [
        ...body.ranges,
        {
          ...level,
          id: 99001,
          series: {
            ...level.series,
            id: 99401,
            measurement_type: "discharge",
            unit: "m3/s",
          },
          range_low: null,
          range_medium: null,
          range_high: null,
          latest_reading: {
            ...level.latest_reading,
            series_id: 99401,
            value: 12.4,
          },
        },
      ];
      await route.fulfill({ response: res, json: body });
    });
    await page.route(/\/series\/99401\/readings/, (route) =>
      route.fulfill({
        json: { bucket_seconds: 0, from: "", to: "", items: [] },
      }),
    );
  }

  test("the block says the gauge, the time, a level dot and word - no number, no trend", async ({
    page,
  }) => {
    await openRail(page);
    await expect(block(page)).toContainText("Test Gauge");
    await expect(block(page).getByTestId("reading-time")).toContainText(
      /\d{2}:\d{2}|\d/,
    );
    const level = block(page).getByTestId("reading-level");
    await expect(level).toContainText("Medium");
    // Neutral ground: the colour is the dot only, no filled chip.
    expect(await computed(level, "background-color")).toBe("rgba(0, 0, 0, 0)");
    const dot = level.locator("span, div").first();
    expect(Math.round((await dot.boundingBox())?.width ?? 0)).toBe(10);
    await expect(block(page)).not.toContainText(/\d+(\.\d)? cm/);
    await expect(block(page)).not.toContainText(
      /rising|falling|steady| in 24 h/,
    );
  });

  test("the period is one text button that opens five items upward", async ({
    page,
  }) => {
    await openRail(page);
    const button = block(page).getByRole("button", { name: "Chart period" });
    await expect(button).toContainText("Last 7 days");
    await expectTouchTargets(button);
    // The open menu hides the page from the tree: measure the trigger first.
    const trigger = await boxOf(button);
    await button.click();
    const items = page.getByRole("menuitem");
    await expect(items).toHaveText([
      "Last 24 hours",
      "Last 7 days",
      "Last 30 days",
      "Last year",
      "Custom range…",
    ]);
    await settled(items.first());
    await expectTouchTargets(items);
    const menu = await boxOf(page.getByRole("menu"));
    expect(menu.y + menu.height).toBeLessThanOrEqual(trigger.y);
    await items.nth(2).click();
    await expect(button).toContainText("Last 30 days");
    await button.click();
    await items.nth(1).click();
    await expect(button).toContainText("Last 7 days");
  });

  test("there is no options button and no grid; the line is 2px", async ({
    page,
  }) => {
    await openRail(page);
    await expect(
      page.getByRole("button", { name: "Chart options" }),
    ).toHaveCount(0);
    await expect(rail(page).locator(".recharts-cartesian-grid")).toHaveCount(0);
    const line = rail(page).locator(".recharts-area-curve").first();
    await expect(line).toHaveCSS("stroke-width", "2px");
  });

  test("the plot runs edge to edge in the rail", async ({ page }) => {
    await openRail(page);
    const p = await boxOf(plot(page));
    const r = await boxOf(rail(page));
    expect(p.x).toBeLessThanOrEqual(r.x + 2);
    expect(p.x + p.width).toBeGreaterThanOrEqual(r.x + r.width - 1);
    const svg = await boxOf(rail(page).locator("svg.recharts-surface"));
    expect(Math.abs(svg.x - p.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(svg.x + svg.width - (p.x + p.width))).toBeLessThanOrEqual(
      1,
    );
  });

  test("the latest dot sits inside the plot; the values pane holds the value", async ({
    page,
  }) => {
    await openRail(page);
    const p = await boxOf(plot(page));
    const dot = await boxOf(rail(page).getByTestId("latest-dot"));
    expect(dot.x + dot.width).toBeLessThanOrEqual(p.x + p.width);
    // The number is in the values pane with its time and age, not beside the dot.
    await expect(rail(page).getByTestId("latest-value")).toHaveCount(0);
    await expect(block(page).getByTestId("reading-value")).toHaveText(
      /^\d+(\.\d)?\s*cm$/,
    );
    await expect(block(page).getByTestId("reading-time")).toContainText(
      /\d{2}:\d{2} · /,
    );
  });

  test("the thresholds are the words Low, Medium, High on the lines, no gutter", async ({
    page,
  }) => {
    await openRail(page);
    const labels = rail(page).getByTestId("threshold-label");
    const words = await labels.allTextContents();
    expect(words.length).toBeGreaterThan(0);
    for (const w of words) expect(["Low", "Medium", "High"]).toContain(w);
    const p = await boxOf(plot(page));
    for (const x of await labels.evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect().x),
    )) {
      expect(
        x - p.x,
        "starts about 12px in from the plot's left",
      ).toBeGreaterThan(11);
      expect(x - p.x).toBeLessThan(15);
    }
  });

  test("the first and last date labels keep 12px from the plot's edges", async ({
    page,
  }) => {
    await openRail(page);
    const p = await boxOf(plot(page));
    const ticks = await rail(page)
      .locator("svg.recharts-surface text")
      .evaluateAll((els) =>
        els
          .filter((e) => e.getAttribute("font-size") === "11")
          .map((e) => {
            const r = e.getBoundingClientRect();
            return { left: r.left, right: r.right };
          }),
      );
    expect(ticks.length).toBeGreaterThan(1);
    expect(Math.min(...ticks.map((t) => t.left)) - p.x).toBeGreaterThanOrEqual(
      11,
    );
    expect(
      p.x + p.width - Math.max(...ticks.map((t) => t.right)),
    ).toBeGreaterThanOrEqual(11);
  });

  test("the credit is one line under the plot, inside the rail", async ({
    page,
  }) => {
    await openRail(page);
    const credit = rail(page).getByTestId("gauge-attribution").first();
    await expect(credit).toContainText("Data: THS · CC BY 4.0");
    const p = await boxOf(plot(page));
    const line = await boxOf(credit);
    expect(line.y).toBeGreaterThanOrEqual(p.y + p.height - 1);
    expect(line.x - p.x, "the credit keeps its 16px").toBeGreaterThanOrEqual(
      15,
    );
    await expectLinksHitAbove(credit.getByRole("link"));
  });

  test("pointing shows the readout in the plot; the values pane stays on the latest", async ({
    page,
  }) => {
    await openRail(page);
    const value = block(page).getByTestId("reading-value");
    const latestText = await value.innerText();
    await expect(
      block(page).getByRole("button", { name: "Latest" }),
    ).toHaveCount(0);
    await pointAt(page, 1 / 3);
    const readout = rail(page).getByTestId("chart-readout");
    await expect(readout).toContainText(/\d+(\.\d)? cm/);
    await expect(readout).toContainText(/, \d{2}:\d{2}/);
    const line = await boxOf(rail(page).getByTestId("chart-marker-line"));
    const beside = await boxOf(readout);
    expect(
      line.x < beside.x || line.x > beside.x + beside.width,
      "the readout sits beside the hairline, not across it",
    ).toBe(true);
    await expect(value).toHaveText(latestText);
    const before = await boxOf(block(page));
    // Off the plot: the point and its readout stay, the line turns dashed.
    await page.mouse.move(5, 300);
    await expect(readout).toHaveCount(1);
    const marker = rail(page).getByTestId("chart-marker-line");
    await expect(marker).toHaveCount(1);
    await expect(marker).toHaveAttribute("stroke-dasharray", "4 4");
    await expect(value).toHaveText(latestText);
    expect((await boxOf(block(page))).height).toBe(before.height);
  });

  test("at the far right the readout stays inside the plot", async ({
    page,
  }) => {
    await openRail(page);
    await pointAt(page, 0.999);
    const readout = rail(page).getByTestId("chart-readout");
    await expect(readout).toBeVisible();
    const p = await boxOf(plot(page));
    const r = await boxOf(readout);
    expect(r.x + r.width).toBeLessThanOrEqual(p.x + p.width);
    await pointAt(page, 0.001);
    const l = await boxOf(readout);
    expect(l.x).toBeGreaterThanOrEqual(p.x);
  });

  test("Level | Flow shows only for a gauge with both, and switches the plot", async ({
    page,
  }) => {
    await openRail(page);
    await expect(
      block(page).getByRole("group", { name: "Reading" }),
    ).toHaveCount(0);
    await page.unroute(/\/water-status$/);
    await withFlow(page);
    await page.reload();
    await expect(rail(page).getByTestId("latest-dot")).toBeVisible();
    const choice = block(page).getByRole("group", { name: "Reading" });
    await expect(choice.getByRole("button")).toHaveText(["Level", "Flow"]);
    // The key is 32px to look at; its ::after takes the rest of the 44px.
    for (const key of await choice.getByRole("button").all()) {
      const hit = await key.evaluate((el) => ({
        w: el.getBoundingClientRect().width,
        h:
          el.getBoundingClientRect().height +
          2 *
            Math.max(
              0,
              (Number.parseFloat(getComputedStyle(el, "::after").height) -
                el.getBoundingClientRect().height) /
                2,
            ),
      }));
      expect(hit.w).toBeGreaterThanOrEqual(44);
      expect(hit.h).toBeGreaterThanOrEqual(44);
    }
    await choice.getByRole("button", { name: "Flow" }).click();
    await expect(choice.getByRole("button", { name: "Flow" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("a section's chart has no close mark", async ({ page }) => {
    await openRail(page);
    await expect(
      block(page).getByRole("button", { name: "Close gauge chart" }),
    ).toHaveCount(0);
  });

  test("a picked gauge closes on the gauge name", async ({ page }) => {
    await page.goto(`/?waterway=${FIX.waterway}`);
    await appReady(page);
    await page.getByRole("tab", { name: "Gauges" }).click();
    await page.locator('[data-testid="gauge-card"]:visible').first().click();
    const close = block(page).getByRole("button", {
      name: "Close gauge chart",
    });
    await expect(close).toBeVisible();
    await expectTouchTargets(close);
    await expect(rail(page).getByTestId("threshold-label")).toHaveCount(0);
    await close.click();
    await expect(close).toHaveCount(0);
  });
});
