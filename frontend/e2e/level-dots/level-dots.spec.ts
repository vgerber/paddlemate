import { expect, type Page, test } from "@playwright/test";
import { appReady, expectNoHorizontalOverflow, FIX } from "../support/fixture";

// Level dots: a dot per section on a closed trip base and on a recent river
// (doc/design.md, "Water levels"). Fixture: Test River with seven sections,
// of which only some have a gauge with thresholds and a fresh reading.

const MARKER = {
  low: "rgb(47, 158, 99)",
  medium: "rgb(213, 127, 0)",
  high: "rgb(229, 72, 63)",
  unknown: "rgba(124, 138, 144, 0.5)",
};

/** Every section answers with a level picked from its id: low, high or no
 * gauge, so one base shows a mix. */
async function mockStatuses(page: Page) {
  await page.route("**/waterways/water-status?*", async (route) => {
    const ids = new URL(route.request().url()).searchParams
      .get("section_ids")
      ?.split(",")
      .map(Number);
    const level = (id: number) => {
      const pick = id % 3;
      if (pick === 2) return { ranges: [] };
      return {
        ranges: [
          {
            id: 1,
            feature_id: 1,
            level: pick === 0 ? "low" : "high",
            range_low: 10,
            range_medium: 20,
            range_high: 30,
            latest_reading: {
              series_id: 1,
              measured_at: new Date().toISOString(),
              value: 15,
            },
            series: { id: 1, unit: "cm" },
            gauge: { id: 1 },
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ],
      };
    };
    await route.fulfill({
      json: Object.fromEntries((ids ?? []).map((id) => [id, level(id)])),
    });
  });
}

const dotColors = async (row: ReturnType<Page["locator"]>) =>
  row
    .getByTestId("level-dots")
    .locator("[data-level]")
    .evaluateAll((els) =>
      els.map((e) => ({
        level: e.getAttribute("data-level"),
        bg: getComputedStyle(e).backgroundColor,
        border: getComputedStyle(e).borderTopColor,
      })),
    );

test.describe("trip bases", () => {
  test("a closed base shows a dot per run, coloured by level", async ({
    page,
  }) => {
    await mockStatuses(page);
    await page.goto(`/trips/${FIX.trips[0]}`);
    await page.getByRole("tab", { name: "Bases", exact: true }).click();
    const rows = page.getByTestId("stay-row").filter({ visible: true });
    await expect(rows.first()).toBeVisible();
    const withDots = rows.filter({ has: page.getByTestId("level-dots") });
    await expect(withDots.first()).toBeVisible();
    const seen = new Set<string>();
    for (const row of await withDots.all()) {
      const dots = await dotColors(row);
      expect(dots.length).toBeGreaterThan(0);
      for (const d of dots) {
        seen.add(d.level ?? "");
        if (d.level === "low") expect(d.bg).toBe(MARKER.low);
        if (d.level === "high") expect(d.bg).toBe(MARKER.high);
        if (d.level === "unknown") expect(d.bg).toBe(MARKER.unknown);
      }
      expect(
        await row.getByTestId("level-dots").getAttribute("aria-label"),
      ).toMatch(/^\d+ of \d+ sections? running/);
    }
    expect(seen.has("unknown")).toBe(true);
    expect(seen.size).toBeGreaterThan(1);
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("recent rivers", () => {
  test("a recent river shows its sections as dots", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "pm.recent-waterways",
        JSON.stringify([{ id: 9001, name: "Test River" }]),
      );
    });
    await page.goto("/?panel=true");
    await appReady(page);
    const row = page
      .getByTestId("recent-river")
      .filter({ visible: true, hasText: "Test River" })
      .first();
    await expect(row.getByTestId("level-dots")).toBeVisible();
    const dots = await dotColors(row);
    expect(dots).toHaveLength(7);
    // Section 9104 has a fresh low reading, 9105 a high one, 9103 no gauge.
    const levels = dots.map((d) => d.level);
    expect(levels).toContain("low");
    expect(levels).toContain("high");
    expect(levels).toContain("unknown");
    for (const d of dots) {
      if (d.level === "low") expect(d.bg).toBe(MARKER.low);
      if (d.level === "high") expect(d.bg).toBe(MARKER.high);
      if (d.level === "unknown") expect(d.bg).toBe(MARKER.unknown);
    }
    expect(
      await row.getByTestId("level-dots").getAttribute("aria-label"),
    ).toMatch(/^\d+ of 7 sections running/);
    expect((await row.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page);
  });
});
