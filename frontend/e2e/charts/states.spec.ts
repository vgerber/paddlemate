import { expect, test } from "@playwright/test";
import { FIX, gotoSection } from "../support/fixture";

// The chart's broken and empty states: no gauge, slow or failing readings,
// a failing river request, and the options open in the desktop dock.

const failure = {
  status: 500,
  contentType: "application/json",
  body: JSON.stringify({
    error: { code: "internal", message: "Server error" },
  }),
};

test("a section without a gauge draws no chart card and no dock", async ({
  page,
}) => {
  await gotoSection(page, "empty");
  await expect(page.getByText("Put in")).toBeVisible();
  await expect(page.getByTestId("chart-card")).toHaveCount(0);
  await expect(page.getByTestId("chart-dock")).toHaveCount(0);
});

test("slow readings show the skeleton, not a spinner", async ({ page }) => {
  await page.route(/\/readings/, async (route) => {
    await new Promise((r) => setTimeout(r, 4000));
    await route.continue().catch(() => undefined);
  });
  await gotoSection(page, "lower");
  await expect(page.getByTestId("chart-skeleton").first()).toBeVisible();
});

test("failing readings show a note with Retry inside the card", async ({
  page,
}) => {
  await page.route(/\/readings/, (route) => route.fulfill(failure));
  await gotoSection(page, "lower");
  const note = page
    .getByTestId("chart-card")
    .filter({ visible: true })
    .getByTestId("chart-error");
  await expect(note).toBeVisible({ timeout: 20_000 });
  await expect(note.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("a failing river request keeps a section header with Retry", async ({
  page,
}) => {
  await page.route(new RegExp(`/waterways/${FIX.waterway}(\\?.*)?$`), (route) =>
    route.fulfill(failure),
  );
  await gotoSection(page, "lower");
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("No sections found.")).toHaveCount(0);
  await expect(page.getByTestId("chart-card")).toHaveCount(0);
});

test("options open in the dock keep the plot tall and chips natural", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "dock is a desktop layout");
  await gotoSection(page, "lower");
  const dock = page.getByTestId("chart-dock");
  await expect(dock.getByTestId("latest-dot")).toBeVisible();
  const before = await dock.getByTestId("latest-dot").boundingBox();
  await dock.getByLabel("Chart options").click();
  const chips = dock.getByTestId("chart-option-chip");
  await expect(chips.first()).toBeVisible();
  const widths = await chips.evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect().width),
  );
  expect(Math.max(...widths)).toBeLessThan(120);
  const plot = await dock.locator("svg").first().boundingBox();
  expect(plot?.height ?? 0).toBeGreaterThan(100);
  expect(before).not.toBeNull();
});

test("options open grow the dock by their row and keep the plot's height", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "dock is a desktop layout");
  await gotoSection(page, "lower");
  const dock = page.getByTestId("chart-dock");
  await expect(dock.getByTestId("latest-dot")).toBeVisible();
  const plotOf = async () =>
    (await dock.locator("svg").first().boundingBox())?.height ?? 0;
  const closed = {
    dock: (await dock.boundingBox())?.height ?? 0,
    plot: await plotOf(),
  };
  await dock.getByLabel("Chart options").click();
  await expect(dock.getByTestId("chart-option-chip").first()).toBeVisible();
  await expect
    .poll(async () => (await dock.boundingBox())?.height ?? 0)
    .toBeGreaterThan(closed.dock + 20);
  expect(Math.abs((await plotOf()) - closed.plot)).toBeLessThanOrEqual(2);
  // The dock stays on the window's foot, so the grown part came from above.
  const box = await dock.boundingBox();
  expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(
    (page.viewportSize()?.height ?? 0) - 16,
  );
});
