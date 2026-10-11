import { expect, type Locator, test } from "@playwright/test";
import { gotoSection } from "../support/fixture";

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

test.describe("floating action button", () => {
  test("clears the strip and the open chart's controls @small", async ({
    page,
  }, info) => {
    test.skip(info.project.name === "desktop", "no button from md up");
    await gotoSection(page, "lower");
    const fab = seen(page.getByRole("button", { name: "New feature" }));
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
});
