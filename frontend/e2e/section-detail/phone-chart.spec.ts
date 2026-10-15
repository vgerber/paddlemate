import { expect, type Page, test } from "@playwright/test";
import { gotoSection } from "../support/fixture";

// The phone's features tab: the chart card takes the pane's free height and
// sits one 8px gutter above the features card.

test.skip(({ isMobile }) => !isMobile, "the phone layout");

const box = async (page: Page, id: string) => {
  const b = await page
    .getByTestId(id)
    .filter({ visible: true })
    .first()
    .boundingBox();
  if (!b) throw new Error(`no ${id}`);
  return b;
};

async function settled(page: Page) {
  await expect(
    page.getByTestId("chart-card").filter({ visible: true }),
  ).toBeVisible();
  await page.waitForTimeout(600);
}

test("the chart is 8px above the features card @small", async ({ page }) => {
  await gotoSection(page, "lower");
  await settled(page);
  const chart = await box(page, "chart-card");
  const feat = await box(page, "features-card");
  expect(Math.round(feat.y - (chart.y + chart.height))).toBe(8);
});

test("a short list lets the chart grow, within half the screen @small", async ({
  page,
}) => {
  await gotoSection(page, "upper");
  await settled(page);
  const chart = await box(page, "chart-card");
  const feat = await box(page, "features-card");
  const vh = page.viewportSize()?.height ?? 0;
  const grown = await page
    .getByTestId("tab-pane")
    .filter({ visible: true })
    .evaluate((p) => p.scrollHeight - p.clientHeight);
  await gotoSection(page, "lower");
  await settled(page);
  const lower = await box(page, "chart-card");
  // At 320x568 the list and the FAB room leave almost nothing to give.
  expect(chart.height).toBeGreaterThan(lower.height + (vh > 700 ? 50 : -1));
  expect(chart.height).toBeLessThanOrEqual(vh * 0.5 + 1);
  // The list stays in reach and nothing scrolls.
  expect(feat.y + feat.height).toBeLessThanOrEqual(vh);
  if (vh > 700)
    expect(grown, "no scrolling for a short list").toBeLessThanOrEqual(1);
});

test("a long list keeps the base chart height", async ({ page }) => {
  await gotoSection(page, "lower");
  await settled(page);
  const chart = await box(page, "chart-card");
  const vh = page.viewportSize()?.height ?? 0;
  const base = Math.min(210, Math.max(160, vh * 0.24));
  // The card is the plot plus its credit line.
  expect(chart.height).toBeLessThan(base + 40);
});
