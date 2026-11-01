import { expect, type Page, test } from "@playwright/test";
import {
  expectNoHorizontalOverflow,
  expectTouchTargets,
} from "../support/fixture";

// The comparison page. Fixture: 9851-9853 the Cascade in S, M, L; 9854-9858
// boats of other models; 9862 Photocraft Blade (a paddle, 645 cm2, 0.86 kg).
// 10554 is a catalogue paddle (Aqua-Bound Shred Carbon, 755 cm2).

const IMPERIAL = { weight: "lb", distance: "mi", length: "in" };

const region = (page: Page) =>
  page.getByRole("region", { name: "Comparison table" });

const compareRow = (page: Page, label: string | RegExp) =>
  region(page).getByTestId("compare-row").filter({ hasText: label });

async function openCompare(page: Page, ids: number[]) {
  await page.goto(`/materials/compare?ids=${ids.join(",")}`);
  await expect(region(page)).toBeVisible();
  await expect(page.getByTestId("compare-row").first()).toBeVisible();
}

test.describe("compare layout", () => {
  test("four entries fit the width with no sideways scroll @small", async ({
    page,
  }) => {
    await openCompare(page, [9851, 9852, 9853, 9854]);
    await expectNoHorizontalOverflow(page);
    const fits = await region(page).evaluate(
      (el) => el.scrollWidth <= el.clientWidth + 1,
    );
    expect(fits, "the table needs no scroll of its own").toBe(true);
    await expect(page.getByTestId("compare-scroll-hint")).toHaveCount(0);
    await expectTouchTargets(
      page.getByRole("button", { name: /Remove .* from the comparison/ }),
    );
  });

  test("more than four entries scroll under a sticky head, with a hint", async ({
    page,
  }) => {
    // The page is up to 1400px wide, which holds six columns: narrow the
    // window on a desktop so the table has to scroll.
    if (test.info().project.name.startsWith("desktop")) {
      await page.setViewportSize({ width: 800, height: 900 });
    }
    await openCompare(page, [9851, 9852, 9853, 9854, 9855, 9856]);
    await expect(page.getByTestId("compare-scroll-hint")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const scrolls = await region(page).evaluate(
      (el) => el.scrollWidth > el.clientWidth,
    );
    expect(scrolls).toBe(true);
    const head = region(page).getByRole("columnheader").first();
    const before = await head.boundingBox();
    await region(page).evaluate((el) => el.scrollTo(0, 80));
    const after = await head.boundingBox();
    expect(after?.y).toBeCloseTo(before?.y ?? 0, 0);
  });

  test("six entries on a wide window fit, so no scroll hint shows", async ({
    page,
  }) => {
    test.skip(
      !test.info().project.name.startsWith("desktop"),
      "a desktop layout",
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await openCompare(page, [9851, 9852, 9853, 9854, 9855, 9856]);
    const fits = await region(page).evaluate(
      (el) => el.scrollWidth <= el.clientWidth + 1,
    );
    expect(fits).toBe(true);
    await expect(page.getByTestId("compare-scroll-hint")).toHaveCount(0);
  });

  test("the values of equal entries sit in the strip, not in the table @small", async ({
    page,
  }) => {
    await openCompare(page, [9851, 9852, 9853]);
    const alike = page.getByTestId("compare-alike");
    await expect(alike).toContainText("Alike in all 3");
    await expect(alike).toContainText("Creek");
    await expect(alike).toContainText("Plastic");
    await expect(compareRow(page, "Groups")).toHaveCount(0);
    await expect(compareRow(page, "Construction")).toHaveCount(0);
    await expect(compareRow(page, "Length (cm)")).toHaveCount(1);
    await expectNoHorizontalOverflow(page);
  });

  test("a bar under a number appears only where the numbers differ, from zero", async ({
    page,
  }) => {
    await openCompare(page, [9851, 9852, 9853]);
    const fills = compareRow(page, "Volume (l)").getByTestId(
      "compare-bar-fill",
    );
    await expect(fills).toHaveCount(3);
    const widths = await fills.evaluateAll((els) =>
      els.map((el) => new DOMMatrix(getComputedStyle(el).transform).a),
    );
    expect(Math.max(...widths)).toBeCloseTo(1, 2);
    expect(Math.min(...widths)).toBeLessThan(0.95);
    await expect(page.getByText(/Bars start at zero/)).toBeVisible();
  });
});

test.describe("compare content", () => {
  test("paddles compare their blade area @small", async ({ page }) => {
    await openCompare(page, [9862, 10554]);
    const area = compareRow(page, "Blade area");
    await expect(area).toContainText("645");
    await expect(area).toContainText("755");
    await expect(area).toContainText("cm²");
    await expect(compareRow(page, /^Weight \(g\)/)).toContainText("860");
    await expectNoHorizontalOverflow(page);
  });

  test("a kayak and a paddle compare only the rows both state", async ({
    page,
  }) => {
    await openCompare(page, [9852, 9862]);
    await expect(page.getByTestId("compare-mixed-note")).toBeVisible();
    await expect(compareRow(page, "Blade area")).toHaveCount(0);
    await expect(compareRow(page, "Volume")).toHaveCount(0);
    await expect(compareRow(page, "Category")).toHaveCount(1);
    await expect(compareRow(page, /^Weight \(kg\)/)).toHaveCount(1);
  });

  test("the units switch changes the row labels and the numbers", async ({
    page,
  }) => {
    await page.addInitScript((units) => {
      localStorage.setItem("pm-units", JSON.stringify(units));
    }, IMPERIAL);
    await openCompare(page, [9851, 9852]);
    await expect(compareRow(page, "Length (in)")).toHaveCount(1);
    await expect(compareRow(page, /^Weight \(lb\)/)).toHaveCount(1);
    await expect(compareRow(page, "Length (cm)")).toHaveCount(0);
    await openCompare(page, [9862, 10554]);
    await expect(compareRow(page, /^Weight \(oz\)/)).toHaveCount(1);
    await expect(compareRow(page, "Blade area (in²)")).toHaveCount(1);
  });
});

test.describe("compare actions", () => {
  test("Add to comparison opens the list with the picks kept", async ({
    page,
  }) => {
    await openCompare(page, [9854, 9855]);
    await page.getByRole("button", { name: "Add to comparison" }).click();
    await expect(page).toHaveURL(
      /\/materials\?.*compare=9854%2C9855|compare=9854,9855/,
    );
    const bar = page.getByTestId("compare-bar");
    await expect(bar).toContainText("2 picked");
    await expect(bar).toContainText("Riverline Squirt");
  });

  test("the size is changed from the column head", async ({ page }) => {
    await openCompare(page, [9851, 9854]);
    const select = page.getByLabel("Size of Testflow Cascade S");
    await expect(select.locator("option")).toHaveText(["S", "M", "L"]);
    await select.selectOption({ label: "L" });
    await expect(page).toHaveURL(/ids=9853(%2C|,)9854/);
    await expect(
      page.getByRole("button", {
        name: "Remove Testflow Cascade L from the comparison",
      }),
    ).toBeVisible();
  });
});
