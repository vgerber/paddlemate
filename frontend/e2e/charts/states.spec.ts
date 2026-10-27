import { expect, test } from "@playwright/test";
import { FIX, gotoSection } from "../support/fixture";

// The chart's broken and empty states: no gauge, slow or failing readings,
// a failing river request, and the period menu open over the desktop map.

const failure = {
  status: 500,
  contentType: "application/json",
  body: JSON.stringify({
    error: { code: "internal", message: "Server error" },
  }),
};

test("a section without a gauge draws no chart card and no rail", async ({
  page,
}) => {
  await gotoSection(page, "empty");
  await expect(page.getByText("Put in")).toBeVisible();
  await expect(page.getByTestId("chart-card")).toHaveCount(0);
  await expect(page.getByTestId("chart-dock")).toHaveCount(0);
});

test("on a wide screen that section ends in a foot row that says so", async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.startsWith("desktop"),
    "the rail is a desktop layout",
  );
  await gotoSection(page, "empty");
  const row = page.getByTestId("no-gauge");
  await expect(row).toContainText("No gauge for this section");
  await expect(row.getByRole("button", { name: "Link a gauge" })).toBeVisible();
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
  // The phone's card or the desktop rail holds the note.
  const note = page
    .locator('[data-testid="chart-card"], [data-testid="chart-dock"]')
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

test("the period menu opens over the map and leaves the plot alone", async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.startsWith("desktop"),
    "the rail is a desktop layout",
  );
  await gotoSection(page, "lower");
  const dock = page.getByTestId("chart-dock");
  await expect(dock.getByTestId("latest-dot")).toBeVisible();
  const plotOf = async () =>
    (await dock.locator("svg").first().boundingBox())?.height ?? 0;
  const closed = {
    dock: (await dock.boundingBox())?.height ?? 0,
    plot: await plotOf(),
  };
  await page.getByRole("button", { name: "Chart period" }).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem")).toHaveCount(5);
  // The menu grows in; wait for its full width.
  await expect.poll(async () => (await menu.boundingBox())?.width).toBe(200);
  expect((await dock.boundingBox())?.height ?? 0).toBe(closed.dock);
  expect(Math.abs((await plotOf()) - closed.plot)).toBeLessThanOrEqual(1);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
});
