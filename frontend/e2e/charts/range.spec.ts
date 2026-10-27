import { expect, type Locator, type Page, test } from "@playwright/test";
import { appReady } from "../support/fixture";
import { mockSummary, type SummaryMock } from "./summary.mock";

// Long chart periods (.claude/handoffs/ui-work/READINGS.md): the chart asks
// the readings summary for the whole period, draws the low-high band for
// bucketed data, and takes a custom range from a dialog, a mouse drag, or the
// URL. The summary route is mocked until the API has it. The Long Gauge
// (Wellerbruecke, section 9111) reads every 15 minutes for two years.

const DAY = 86400000;
const LONG = "/?waterway=9002&section=9111";

function plot(page: Page): Locator {
  return page.locator('[data-testid="chart-plot"]:visible').first();
}

async function openLong(
  page: Page,
  opts: { preset?: string; mock?: SummaryMock; search?: string } = {},
) {
  const seen = await mockSummary(page, opts.mock);
  await page.addInitScript((preset) => {
    try {
      localStorage.setItem("chart-time-range", preset);
    } catch {
      // storage blocked: the default is 7d
    }
  }, opts.preset ?? "7d");
  await page.goto(`${LONG}${opts.search ?? ""}`);
  await appReady(page);
  await expect(plot(page).locator("svg.recharts-surface")).toBeVisible();
  return seen;
}

/** Left and right of everything the value line draws, relative to the plot. */
async function lineSpan(page: Page) {
  return plot(page).evaluate((el) => {
    const svg = el
      .querySelector("svg.recharts-surface")
      ?.getBoundingClientRect();
    const curves = [...el.querySelectorAll(".recharts-area-curve")];
    const boxes = curves.map((c) => c.getBoundingClientRect());
    const left = Math.min(...boxes.map((b) => b.left));
    const right = Math.max(...boxes.map((b) => b.right));
    return {
      left: svg ? (left - svg.left) / svg.width : NaN,
      right: svg ? (right - svg.left) / svg.width : NaN,
    };
  });
}

async function chooseCustom(page: Page, from: string, to: string) {
  await page
    .locator('button[aria-label$="chart period"]:visible')
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Custom range…" }).click();
  const dialog = page.getByRole("dialog", { name: "Custom range" });
  await dialog.locator('input[type="date"][aria-label="From"]').fill(from);
  await dialog.locator('input[type="date"][aria-label="To"]').fill(to);
  return dialog;
}

function dayAgo(n: number): string {
  const d = new Date(Date.now() - n * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function pointMiddle(page: Page) {
  const box = await plot(page).boundingBox();
  if (!box) throw new Error("no plot");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 3, y, { steps: 5 });
  await page.mouse.move(box.x + box.width / 2, y, { steps: 5 });
}

const periodButton = (page: Page) =>
  page.locator('button[aria-label$="chart period"]:visible').first();

for (const [preset, label] of [
  ["1m", "month"],
  ["1y", "year"],
] as const) {
  test(`the ${label} view reaches back the whole period, in about one point per 2-3px`, async ({
    page,
  }) => {
    const seen = await openLong(page, { preset });
    await expect.poll(() => seen.length).toBeGreaterThan(0);
    const asked = seen[seen.length - 1];
    const days = preset === "1m" ? 30 : 365;
    const from = Date.parse(asked.get("from") as string);
    expect(Math.abs(Date.now() - from - days * DAY)).toBeLessThan(2 * DAY);
    const width = (await plot(page).boundingBox())?.width ?? 0;
    const points = Number(asked.get("points"));
    expect(points).toBeGreaterThanOrEqual(10);
    expect(points).toBeLessThanOrEqual(1000);
    expect(width / points, "px per point").toBeGreaterThan(1.5);
    expect(width / points, "px per point").toBeLessThan(3.5);
    const span = await lineSpan(page);
    expect(span.left, "first point near From").toBeLessThan(0.03);
    expect(span.right).toBeGreaterThan(0.95);
  });
}

test("a bucketed view draws the low-high band, a raw one does not", async ({
  page,
}) => {
  await openLong(page, { preset: "1y" });
  await expect(plot(page).locator(".chart-band")).toHaveCount(1);
  await periodButton(page).click();
  await page.getByRole("menuitem", { name: "Last 24 hours" }).click();
  await expect(plot(page).locator(".chart-band")).toHaveCount(0);
});

test("a bucket reads average and low - high", async ({ page }, info) => {
  test.skip(
    !info.project.name.startsWith("desktop"),
    "the readout sits on the rail",
  );
  await openLong(page, { preset: "1y" });
  await pointMiddle(page);
  await expect(page.getByTestId("chart-readout")).toContainText(
    /\d+(\.\d)? - \d+(\.\d)? cm/,
  );
});

test("a raw reading reads just the value", async ({ page }, info) => {
  test.skip(
    !info.project.name.startsWith("desktop"),
    "the readout sits on the rail",
  );
  await openLong(page, { preset: "24h" });
  await pointMiddle(page);
  const readout = page.getByTestId("chart-readout");
  await expect(readout).toContainText(/\d+(\.\d)? cm/);
  await expect(readout).not.toContainText(" - ");
});

test("a hole in the data stays a gap in the line", async ({ page }) => {
  const now = Date.now();
  await openLong(page, {
    preset: "1m",
    mock: { hole: [now - 20 * DAY, now - 10 * DAY] },
  });
  // A line drawn through the hole is one path; a gap makes it several
  // subpaths (each starts with its own M).
  const subpaths = await plot(page)
    .locator(".recharts-area-curve")
    .last()
    .evaluate((p) => (p.getAttribute("d")?.match(/M/g) ?? []).length);
  expect(subpaths).toBeGreaterThan(1);
});

test("the custom range from the menu: defaults, validation, label, two years", async ({
  page,
}) => {
  const seen = await openLong(page);
  await periodButton(page).click();
  const items = page.getByRole("menuitem");
  await expect(items.last()).toHaveText("Custom range…");
  await items.last().click();
  const dialog = page.getByRole("dialog", { name: "Custom range" });
  await expect(
    dialog.locator('input[type="date"][aria-label="From"]'),
  ).toHaveValue(dayAgo(30));
  await expect(
    dialog.locator('input[type="date"][aria-label="To"]'),
  ).toHaveValue(dayAgo(0));
  await expect(
    dialog.locator('input[type="date"][aria-label="To"]'),
  ).toHaveAttribute("max", dayAgo(0));
  // From must be before To; the dialog stays and says so.
  await dialog.locator('input[type="date"][aria-label="From"]').fill(dayAgo(0));
  await expect(dialog.getByRole("alert")).toHaveText("From must be before To.");
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(dialog).toBeVisible();
  // Two years back.
  await dialog
    .locator('input[type="date"][aria-label="From"]')
    .fill(dayAgo(729));
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(dialog).toBeHidden();
  await expect(periodButton(page)).toContainText(
    /^\d{1,2} \w{3} \d{4} - \d{1,2} \w{3} \d{4}/,
  );
  const asked = seen[seen.length - 1];
  expect(Date.now() - Date.parse(asked.get("from") as string)).toBeGreaterThan(
    728 * DAY,
  );
  const span = await lineSpan(page);
  expect(span.left, "first point near From").toBeLessThan(0.03);
});

test("a custom range shows as the label, rides in the URL and survives a reload", async ({
  page,
}) => {
  await openLong(page);
  const dialog = await chooseCustom(page, dayAgo(40), dayAgo(10));
  await dialog.getByRole("button", { name: "Apply" }).click();
  const label = await periodButton(page).innerText();
  expect(label).toMatch(/ - /);
  expect(decodeURIComponent(page.url())).toMatch(/chartFrom=.*chartTo=/);
  await page.reload();
  await appReady(page);
  await expect(periodButton(page)).toHaveText(label);
  // Reset goes back to the preset and drops the range from the URL.
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(periodButton(page)).toHaveText("Last 7 days");
  expect(page.url()).not.toContain("chartFrom");
});

test("a link with the range opens on it", async ({ page }) => {
  const from = new Date(Date.now() - 20 * DAY).toISOString();
  const to = new Date(Date.now() - 5 * DAY).toISOString();
  const seen = await openLong(page, {
    search: `&chartFrom=${encodeURIComponent(JSON.stringify(from))}&chartTo=${encodeURIComponent(JSON.stringify(to))}`,
  });
  await expect(periodButton(page)).toContainText(" - ");
  await expect.poll(() => seen.length).toBeGreaterThan(0);
  expect(seen[seen.length - 1].get("to")).toBe(to);
});

test("dragging over the plot with a mouse zooms to that span", async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.startsWith("desktop"),
    "a mouse drag; phones keep swiping",
  );
  await openLong(page);
  const box = await plot(page).boundingBox();
  if (!box) throw new Error("no plot");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.3, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.45, y, { steps: 4 });
  await page.mouse.move(box.x + box.width * 0.6, y, { steps: 4 });
  await expect(page.getByTestId("drag-selection")).toBeVisible();
  await page.mouse.up();
  await expect(page.getByTestId("drag-selection")).toHaveCount(0);
  await expect(periodButton(page)).toContainText(" - ");
  expect(decodeURIComponent(page.url())).toContain("chartFrom=");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(periodButton(page)).toHaveText("Last 7 days");
});

test("a click on the plot does not zoom", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("desktop"), "a mouse click");
  await openLong(page);
  const box = await plot(page).boundingBox();
  if (!box) throw new Error("no plot");
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height / 2);
  await expect(periodButton(page)).toHaveText("Last 7 days");
  expect(page.url()).not.toContain("chartFrom");
});

test("the plot says where the readings start instead of drawing empty space", async ({
  page,
}) => {
  const startMs = Date.now() - 20 * DAY;
  await openLong(page, { preset: "1y", mock: { startMs } });
  const note = page.getByTestId("readings-start");
  await expect(note).toHaveText(/^Readings start \d{1,2} \w{3} \d{4}\.$/);
  const span = await lineSpan(page);
  expect(span.left, "the line starts at the plot's left edge").toBeLessThan(
    0.03,
  );
});

test("data that reaches back to From says nothing", async ({ page }) => {
  await openLong(page, { preset: "1m" });
  await expect(plot(page).locator("svg.recharts-surface")).toBeVisible();
  await expect(page.getByTestId("readings-start")).toHaveCount(0);
});

test("a link whose range is backwards is ignored", async ({ page }) => {
  const from = new Date(Date.now() - 5 * DAY).toISOString();
  const to = new Date(Date.now() - 20 * DAY).toISOString();
  await openLong(page, {
    search: `&chartFrom=${encodeURIComponent(JSON.stringify(from))}&chartTo=${encodeURIComponent(JSON.stringify(to))}`,
  });
  await expect(periodButton(page)).toHaveText("Last 7 days");
});
