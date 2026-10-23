import { expect, type Page, test } from "@playwright/test";
import { appReady, FIX, gotoSection } from "../support/fixture";

// Accessibility musts: every map marker is one named control, and the chart
// is a named, focusable plot whose readout reaches the keyboard and screen
// readers.

async function openRiver(page: Page) {
  await page.goto(`/?waterway=${FIX.waterway}`);
  await appReady(page);
  await expect(page.locator(".maplibregl-marker").first()).toBeAttached({
    timeout: 15_000,
  });
}

test.describe("map markers", () => {
  test("no marker wraps a control in a generic button", async ({ page }) => {
    await openRiver(page);
    const markers = page.locator(".maplibregl-marker");
    expect(await markers.count()).toBeGreaterThan(0);
    // MapLibre's default role=button / "Map marker" must not survive.
    await expect(page.locator('[aria-label="Map marker"]')).toHaveCount(0);
    expect(
      await page.locator('.maplibregl-marker[role="button"] button').count(),
      "nested-interactive",
    ).toBe(0);
  });

  test("note and gauge markers are named controls", async ({ page }) => {
    await openRiver(page);
    const buttons = page.locator(".maplibregl-marker button");
    const n = await buttons.count();
    expect(n, "the river shows note or gauge markers").toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const b = buttons.nth(i);
      const name =
        (await b.getAttribute("aria-label")) ?? (await b.getAttribute("title"));
      expect(name, "marker button has its own name").toBeTruthy();
      expect(name).not.toBe("Map marker");
      const box = await b.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("section chart", () => {
  async function plot(page: Page) {
    await gotoSection(page, "lower");
    const chart = page
      .getByRole("group", { name: /chart/i })
      .filter({ has: page.getByTestId("latest-dot") })
      .first();
    await expect(chart).toBeVisible({ timeout: 15_000 });
    return chart;
  }

  test("is named and focusable with a visible ring", async ({ page }) => {
    const chart = await plot(page);
    await expect(chart).toHaveAccessibleName(/chart/i);
    await chart.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(chart).toBeFocused();
    const outline = await chart.evaluate((el) => {
      const s = getComputedStyle(el);
      return `${s.outlineStyle} ${s.outlineWidth}`;
    });
    expect(outline).toMatch(/solid [1-9]/);
  });

  test("arrow keys show and announce the readout", async ({ page }) => {
    const chart = await plot(page);
    await chart.focus();
    await page.keyboard.press("End");
    const region = page.getByTestId("chart-live-region");
    await expect(region).toHaveText(/\d+(\.\d)? .+/);
    const first = await region.textContent();
    // The announcer throttles; the last of three presses is the one spoken.
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(region).not.toHaveText(first ?? "");
    await expect(region).toHaveAttribute("aria-live", "polite");
    // One shared region, however many readouts were spoken.
    await expect(page.getByTestId("chart-live-region")).toHaveCount(1);
  });
});
