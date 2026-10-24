import { expect, type Page, test } from "@playwright/test";
import { appReady, FIX } from "../support/fixture";

// The water chip and the grade tag of a section row never overlap, however
// long the reading or the grade, and at any width.

interface Status {
  ranges: {
    series: { unit: string };
    latest_reading: { value: number } | null;
  }[];
}

async function longReadings(page: Page) {
  await page.route(/\/water-status(\?|$)/, async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    const statuses: Status[] = route.request().url().includes("section_ids")
      ? Object.values(body)
      : [body];
    for (const s of statuses) {
      for (const r of s.ranges) {
        r.series.unit = "m³/s";
        if (r.latest_reading) r.latest_reading.value = 1250.5;
      }
    }
    await route.fulfill({ response: res, json: body });
  });
}

/** Rewrites every section of the river to a long name, so rows are tight. */
async function longNames(page: Page) {
  await page.route(/\/waterways\/\d+\/sections(\?|$)/, async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    if (Array.isArray(body)) {
      for (const s of body) {
        s.name = `${s.name} between the old mill and the lower weir bridge`;
      }
    }
    await route.fulfill({ response: res, json: body });
  });
}

test("the water chip and the grade tag never overlap in a section row @small", async ({
  page,
}) => {
  await longReadings(page);
  await longNames(page);
  await page.goto(`/?waterway=${FIX.waterway}`);
  await appReady(page);
  const rows = page.locator(".MuiListItemButton-root:visible", {
    has: page.locator("[data-testid=grade-tag]"),
  });
  await expect(rows.first()).toBeVisible();
  await expect(
    page.locator("[data-level]:visible", { hasText: "m³/s" }).first(),
  ).toBeVisible();
  // Long grades, as a section graded "IV-V (VI)" reads.
  await page
    .locator("[data-testid=grade-tag]")
    .evaluateAll((els) => els.forEach((e) => (e.textContent = "IV-V (VI)")));
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const r = await rows.nth(i).evaluate((row) => {
      const b = (el: Element | null) => el?.getBoundingClientRect();
      return {
        row: b(row),
        tag: b(row.querySelector("[data-testid=grade-tag]")),
        chip: b(row.querySelector("[data-level]")),
      };
    });
    if (!r.row || !r.tag || !r.chip) continue;
    const apart =
      r.tag.right <= r.chip.left + 0.5 ||
      r.chip.right <= r.tag.left + 0.5 ||
      r.tag.bottom <= r.chip.top + 0.5 ||
      r.chip.bottom <= r.tag.top + 0.5;
    expect(apart, `row ${i}: ${JSON.stringify([r.row, r.tag, r.chip])}`).toBe(
      true,
    );
    expect(r.chip.right).toBeLessThanOrEqual(r.row.right + 0.5);
    expect(r.tag.left).toBeGreaterThanOrEqual(r.row.left - 0.5);
  }
});
