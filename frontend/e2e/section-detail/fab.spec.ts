import { expect, type Locator, test } from "@playwright/test";
import { appReady, gotoSection } from "../support/fixture";

// The round action button floats over a scroller. Nothing a finger needs may
// sit under it: the chart's controls and the strip at the top of a section,
// and the level pills at the foot of the search results.

const seen = (l: Locator) => l.filter({ visible: true });

async function box(l: Locator) {
  const b = await l.boundingBox();
  expect(b, "drawn").not.toBeNull();
  return b as NonNullable<typeof b>;
}

async function expectClear(a: Locator, fab: Locator, what: string) {
  const [x, f] = [await box(a), await box(fab)];
  const apart =
    x.x + x.width <= f.x ||
    f.x + f.width <= x.x ||
    x.y + x.height <= f.y ||
    f.y + f.height <= x.y;
  expect(apart, `${what} is under the button`).toBe(true);
}

/** Scroll the results list (the pane's scrolling child) to its foot. */
async function scrollToEnd(pane: Locator) {
  await pane.evaluate((el) => {
    for (const child of el.querySelectorAll("*")) {
      if (child.scrollHeight > child.clientHeight + 4) child.scrollTop = 1e6;
    }
  });
}

test.describe("floating action button", () => {
  test("clears the strip and the open chart's controls @small", async ({
    page,
  }) => {
    await gotoSection(page, "lower");
    const fab = seen(page.getByRole("button", { name: "Section actions" }));
    await expect(fab).toBeVisible();
    const discs = seen(page.getByTestId("features-strip")).locator(
      "[data-disc]",
    );
    const n = await discs.count();
    expect(n, "the strip draws its features").toBeGreaterThan(3);
    for (let i = 0; i < n; i++)
      await expectClear(discs.nth(i), fab, `strip disc ${i}`);
    const chart = seen(page.getByTestId("chart-card"));
    await chart.getByRole("button", { name: "Chart options" }).click();
    await expectClear(
      chart.getByRole("button", { name: "Close chart options" }),
      fab,
      "the close chevron",
    );
    await expectClear(
      chart.getByRole("button", { name: "1Y", exact: true }),
      fab,
      "the 1Y period",
    );
  });

  test("clears the last row of the search results, with its level pill @small", async ({
    page,
  }) => {
    await page.goto("/?panel=1");
    await appReady(page);
    await seen(page.getByPlaceholder("Search rivers or sections…")).fill(
      "Test",
    );
    const pane = seen(page.getByTestId("search-pane"));
    await seen(
      page.locator("button.MuiTab-root", { hasText: /^Sections \(/ }),
    ).click();
    const pills = pane.locator("[data-level]");
    await expect(pills.first()).toBeVisible();
    await scrollToEnd(pane);
    const fab = seen(page.getByRole("button", { name: "New river" }));
    await expect(fab).toBeVisible();
    // The last row is where a pill would sit, whether or not it has one.
    await expectClear(
      pane.locator(".MuiListItemButton-root").last(),
      fab,
      "the last result row",
    );
  });
});
