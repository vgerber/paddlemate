import { expect, type Page, test } from "@playwright/test";
import {
  appReady,
  computed,
  expectNoHorizontalOverflow,
  expectTouchTargets,
  gotoSection,
} from "../support/fixture";

// WP5: the chart card that opens, the gauge cards and the credit line
// (doc/plans/ui-overhaul/calm-design.html, "A chart that opens for its
// options"). The fixture gauge reads about 85 cm with thresholds 60/80/120.

const PERIODS = ["24h", "7d", "1M", "3M", "6M", "1Y"];

function card(page: Page) {
  return page.locator('[data-testid="chart-card"]:visible').first();
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
  await page.addInitScript(() => {
    try {
      localStorage.setItem("chart-time-range", "7d");
    } catch {
      // storage blocked: the default is 7d anyway
    }
  });
});

test.describe("closed card", () => {
  test("shows the reading, its time and the period, and one 44px button", async ({
    page,
  }) => {
    await openSection(page);
    const outline = card(page).getByTestId("chart-outline");
    await expect(outline).toContainText(/^\d+(\.\d)? cm/);
    await expect(outline).toContainText(/\d{2}:\d{2} · 7d$/);
    const button = card(page).getByRole("button", { name: "Chart options" });
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expectTouchTargets(button);
    // Closed means no options: no period chips.
    await expect(card(page).getByRole("button", { name: "1M" })).toHaveCount(0);
  });

  test("the reading is neutral ink, not a level color", async ({ page }) => {
    await openSection(page);
    const value = card(page).getByTestId("chart-reading");
    expect(await computed(value, "color")).toBe("rgb(31, 43, 49)");
    await expect(card(page).locator("[data-level]")).toHaveCount(0);
  });

  test("the credit is one small grey line with teal links", async ({
    page,
  }) => {
    await openSection(page);
    const credit = card(page).getByTestId("gauge-attribution").first();
    await expect(credit).toContainText("Data: THS · CC BY 4.0");
    expect(await computed(credit, "font-size")).toBe("12px");
    expect(await computed(credit, "color")).toBe("rgb(88, 102, 109)");
    const link = credit.getByRole("link").first();
    expect(await computed(link, "color")).toBe("rgb(14, 116, 144)");
    const h = (await credit.boundingBox())?.height ?? 0;
    expect(h, "one line").toBeLessThanOrEqual(20);
  });

  test("threshold labels sit short of the latest reading's dot", async ({
    page,
  }) => {
    await openSection(page);
    await expect(card(page).getByTestId("threshold-label")).toHaveCount(3);
    // Read every box in one pass: the chart may redraw between two reads.
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
    expect(labels).toHaveLength(3);
    for (const b of labels) {
      const apart =
        b.x + b.w <= d.x ||
        d.x + d.w <= b.x ||
        b.y + b.h <= d.y ||
        d.y + d.h <= b.y;
      expect(apart, `${b.text} overlaps the dot`).toBe(true);
      expect(b.x + b.w, `${b.text} ends before the dot`).toBeLessThan(d.x);
    }
  });

  test("the plot starts below the outline, so it never covers the line", async ({
    page,
  }) => {
    await openSection(page);
    const outline = await card(page).getByTestId("chart-outline").boundingBox();
    // The plot starts `data-plot-top` px into the chart: the line cannot
    // rise above it.
    const plotTop = await card(page)
      .locator("[data-plot-top]")
      .first()
      .evaluate(
        (el) =>
          el.getBoundingClientRect().y +
          Number(el.getAttribute("data-plot-top")),
      );
    expect(outline).not.toBeNull();
    const o = outline as NonNullable<typeof outline>;
    expect(plotTop, "plot top is below the outline").toBeGreaterThanOrEqual(
      o.y + o.height - 1,
    );
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
});

test.describe("open card", () => {
  test("lists the reading and all six periods, each 44px to hit", async ({
    page,
  }) => {
    await openSection(page);
    await card(page).getByRole("button", { name: "Chart options" }).click();
    const chips = card(page).getByTestId("chart-option-chip");
    await expect(chips).toHaveCount(1 + PERIODS.length);
    for (const p of PERIODS) {
      await expect(
        card(page).getByRole("button", { name: p, exact: true }),
      ).toBeVisible();
    }
    // The chip's drawn height is 32px; the hit area is the pseudo element.
    const hits = await chips.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        const after = getComputedStyle(el, "::after");
        const inset = (v: string) => Number.parseFloat(v) || 0;
        return (
          r.height + Math.abs(inset(after.top)) + Math.abs(inset(after.bottom))
        );
      }),
    );
    for (const h of hits) expect(h).toBeGreaterThanOrEqual(44);
    await expect(
      card(page).getByRole("button", { name: /^\d+(\.\d)? cm$/ }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(card(page)).toContainText("Test Gauge");
    await expect(
      card(page).getByRole("button", { name: "Close chart options" }),
    ).toBeVisible();
  });

  test("choosing a period updates the outline; the chevron closes", async ({
    page,
  }) => {
    await openSection(page);
    await card(page).getByRole("button", { name: "Chart options" }).click();
    await card(page).getByRole("button", { name: "1M", exact: true }).click();
    await card(page)
      .getByRole("button", { name: "Close chart options" })
      .click();
    await expect(card(page).getByTestId("chart-outline")).toContainText(
      /· 1M$/,
    );
    await expect(
      card(page).getByRole("button", { name: "Chart options" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  test("the keyboard never loses focus to the page when it opens and closes", async ({
    page,
  }) => {
    await openSection(page);
    const active = () =>
      page.evaluate(
        () =>
          document.activeElement?.getAttribute("aria-label") ??
          document.activeElement?.tagName,
      );
    await card(page).getByRole("button", { name: "Chart options" }).focus();
    await page.keyboard.press("Enter");
    await expect.poll(active).toBe("Close chart options");
    await page.keyboard.press("Enter");
    await expect.poll(active).toBe("Chart options");
  });

  test("a gauge with flow offers both readings", async ({ page }) => {
    await page.route(/\/water-status$/, async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      const level = body.ranges[0];
      if (!level) return route.fulfill({ response: res, json: body });
      const flow = {
        ...level,
        id: 99001,
        series: {
          ...level.series,
          id: 99401,
          measurement_type: "discharge",
          unit: "m³/s",
        },
        range_low: null,
        range_medium: null,
        range_high: null,
        latest_reading: {
          ...level.latest_reading,
          series_id: 99401,
          value: 12.4,
        },
      };
      body.ranges = [...body.ranges, flow];
      await route.fulfill({ response: res, json: body });
    });
    await page.route(/\/series\/99401\/readings/, (route) =>
      route.fulfill({ json: [] }),
    );
    await openSection(page);
    await card(page).getByRole("button", { name: "Chart options" }).click();
    const flow = card(page).getByRole("button", { name: "12.4 m³/s" });
    await expect(flow).toBeVisible();
    await flow.click();
    await expect(flow).toHaveAttribute("aria-pressed", "true");
    await card(page)
      .getByRole("button", { name: "Close chart options" })
      .click();
    await expect(card(page).getByTestId("chart-reading")).toHaveText(
      "12.4 m³/s",
    );
  });
});

test.describe("layout", () => {
  test("the section screen never scrolls sideways, open or closed @small", async ({
    page,
  }) => {
    await openSection(page);
    await expectNoHorizontalOverflow(page);
    await card(page).getByRole("button", { name: "Chart options" }).click();
    await expect(
      card(page).getByRole("button", { name: "1Y", exact: true }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const c = (await card(page).boundingBox()) as NonNullable<
      Awaited<ReturnType<ReturnType<typeof card>["boundingBox"]>>
    >;
    // The card clips its own overflow, so check what is inside it too.
    const chips = await card(page)
      .getByTestId("chart-option-chip")
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right));
    for (const right of chips) expect(right).toBeLessThanOrEqual(c.x + c.width);
    const viewport = page.viewportSize()?.width ?? 0;
    expect(c.x + c.width).toBeLessThanOrEqual(viewport);
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

test("screens for review", async ({ page }, testInfo) => {
  await openSection(page);
  await testInfo.attach("closed", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  await card(page).getByRole("button", { name: "Chart options" }).click();
  await testInfo.attach("open", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
});
