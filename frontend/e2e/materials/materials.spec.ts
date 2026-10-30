import { expect, type Page, test } from "@playwright/test";
import {
  computed,
  expectNoHorizontalOverflow,
  expectTouchTargets,
} from "../support/fixture";

// The material wiki. Fixture entries 9851-9860: the Testflow Cascade in S, M
// and L (the same-model comparison), two Riverline boats, Northline, an
// Alpiner slalom boat, a canoe and a packraft. Only the @write tests change
// data, and they put it back.

const row = (page: Page, name: string) =>
  page
    .getByTestId("material-row")
    .filter({ hasText: name })
    .filter({ visible: true });

const rows = (page: Page) =>
  page.getByTestId("material-row").filter({ visible: true });

async function openWiki(page: Page, query = "") {
  await page.goto(`/materials${query}`);
  await expect(rows(page).first()).toBeVisible();
}

test.describe("wiki list", () => {
  test("lists the entries with their kind and figures", async ({ page }) => {
    await openWiki(page);
    await expect(rows(page)).toHaveCount(10);
    const cascade = row(page, "Testflow Cascade M");
    await expect(cascade).toContainText("Creek");
    await expect(cascade).toContainText("Length 264 cm");
    await expect(cascade).toContainText("Volume 320 l");
    await expectNoHorizontalOverflow(page);
  });

  test("a misspelled name still finds the boat", async ({ page }) => {
    await openWiki(page);
    await page.getByRole("textbox", { name: "Brand or model" }).fill("cascde");
    await expect(rows(page)).toHaveCount(3);
    await expect(page).toHaveURL(/q=cascde/);
    await page.getByRole("textbox", { name: "Brand or model" }).fill("zzzz");
    await expect(page.getByTestId("empty-state")).toBeVisible();
  });

  test("the filters sheet narrows the list and shows as chips", async ({
    page,
  }) => {
    await openWiki(page);
    await page.getByTestId("filters-chip").click();
    const sheet = page.getByRole("dialog", { name: "Filters" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Creek" }).click();
    await expect(
      sheet.getByRole("button", { name: /3 results/ }),
    ).toBeVisible();
    await sheet.getByRole("button", { name: /3 results/ }).click();
    await expect(rows(page)).toHaveCount(3);
    await expect(page).toHaveURL(/discipline=creek/);
    // The set filter is a chip that takes itself away.
    const chip = page.getByRole("button", { name: "Creek", exact: true });
    await expect(chip).toBeVisible();
    await chip.locator(".MuiChip-deleteIcon").click();
    await expect(rows(page)).toHaveCount(10);
  });

  test("the paddler weight keeps boats that fit or state no range", async ({
    page,
  }) => {
    await openWiki(page, "?fits=120");
    // 120 kg: Cascade M (70-110) and S (45-75) are out; the sliced, play and
    // slalom boats top out below it.
    await expect(row(page, "Cascade M")).toHaveCount(0);
    await expect(row(page, "Testflow Cascade L")).toBeVisible();
    await expect(row(page, "Tandem")).toBeVisible();
  });

  test("controls are at least 44px and the list has no axe-level overflow", async ({
    page,
  }) => {
    await openWiki(page);
    await expectTouchTargets(
      page
        .locator("main, body")
        .first()
        .locator("input[type=checkbox], [data-testid=filters-chip]")
        .filter({ visible: true }),
    );
    const first = rows(page).first().getByRole("button").first();
    expect((await first.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  });

  test("the row is a card on a phone and flat on a desktop", async ({
    page,
  }, info) => {
    await openWiki(page);
    const shadow = await computed(rows(page).first(), "box-shadow");
    if (info.project.name.startsWith("desktop")) {
      expect(shadow).toBe("none");
    } else {
      expect(shadow).not.toBe("none");
    }
  });

  test("Tools links the wiki with its count", async ({ page }) => {
    await page.goto("/tools");
    const link = page.getByRole("link", { name: /Material wiki/ });
    await expect(link).toBeVisible();
    await expect(link).toContainText(/\d+/);
    await link.click();
    await expect(page).toHaveURL(/\/materials/);
    await expect(rows(page).first()).toBeVisible();
  });
});

test.describe("comparison", () => {
  test("two picks compare, differing rows are accented, a pick can be removed", async ({
    page,
  }) => {
    await openWiki(page);
    await page.getByLabel("Compare Testflow Cascade S").check();
    const bar = page.getByTestId("compare-bar");
    await expect(bar).toContainText("1 of 8 picked");
    await expect(bar.getByRole("button", { name: "Compare" })).toBeDisabled();
    await page.getByLabel("Compare Testflow Cascade L").check();
    await bar.getByRole("button", { name: "Compare" }).click();

    await expect(page).toHaveURL(/\/materials\/compare\?ids=/);
    const table = page.getByRole("region", { name: "Comparison table" });
    await expect(table).toBeVisible();
    await expect(table.getByRole("row", { name: /Volume/ })).toContainText(
      "295 l",
    );
    await expect(table.getByRole("row", { name: /Volume/ })).toContainText(
      "345 l",
    );
    // Same model, same discipline: that row does not differ and is not accented.
    const same = table
      .getByRole("row", { name: /Discipline/ })
      .getByRole("cell")
      .first();
    const differs = table
      .getByRole("row", { name: /Volume/ })
      .getByRole("cell")
      .first();
    expect(await computed(same.locator("p"), "color")).not.toBe(
      await computed(differs.locator("p"), "color"),
    );
    await expectTouchTargets(
      page.getByRole("button", { name: /Remove .* from the comparison/ }),
    );

    await page
      .getByRole("button", {
        name: "Remove Testflow Cascade S from the comparison",
      })
      .click();
    await expect(page).toHaveURL(/ids=%?2?2?\d+%?2?2?$/);
  });

  test("the ninth pick is refused", async ({ page }) => {
    await openWiki(page);
    const boxes = rows(page).getByRole("checkbox");
    for (let i = 0; i < 8; i++) await boxes.nth(i).check();
    await expect(page.getByTestId("compare-bar")).toContainText("8 of 8");
    await expect(boxes.nth(8)).toBeDisabled();
  });

  test("a single-id link still opens", async ({ page }) => {
    await page.goto("/materials/compare?ids=9853");
    await expect(
      page.getByRole("region", { name: "Comparison table" }),
    ).toContainText("Cascade L");
  });

  test("a comparison link survives a reload @small", async ({ page }) => {
    await openWiki(page);
    await page.getByLabel("Compare Testflow Cascade S").check();
    await page.getByLabel("Compare Testflow Cascade M").check();
    await page.getByLabel("Compare Testflow Cascade L").check();
    await page
      .getByTestId("compare-bar")
      .getByRole("button", { name: "Compare" })
      .click();
    const table = page.getByRole("region", { name: "Comparison table" });
    await expect(table).toBeVisible();
    await page.reload();
    await expect(table).toBeVisible();
    // The table scrolls inside its card; the page does not.
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("entry", () => {
  test("shows what the entry states and its source @small", async ({
    page,
  }) => {
    await openWiki(page, "?q=Cascade");
    await row(page, "Testflow Cascade M").getByRole("button").first().click();
    await expect(page).toHaveURL(/\/materials\/\d+/);
    await expect(page.getByText("Hull", { exact: true })).toBeVisible();
    await expect(page.getByText("264 cm")).toBeVisible();
    await expect(page.getByText("70-110")).toHaveCount(0);
    await expect(page.getByText("110 kg")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Manufacturer page/ }),
    ).toHaveAttribute("href", "https://example.com/cascade");
    await expect(page.getByText(/Added by/)).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("the header menu offers edit to a signed-in paddler", async ({
    page,
  }) => {
    await openWiki(page, "?q=Cascade");
    await row(page, "Testflow Cascade M").getByRole("button").first().click();
    await page.getByRole("button", { name: "Entry actions" }).click();
    await expect(
      page.getByRole("menuitem", { name: "Edit entry" }),
    ).toBeVisible();
  });

  test("an unknown entry says so", async ({ page }) => {
    await page.goto("/materials/99999999");
    await expect(
      page.getByText("This entry is not in the wiki."),
    ).toBeVisible();
  });
});

test.describe("adding and correcting", () => {
  test("the form needs brand and model before it saves", async ({ page }) => {
    await page.goto("/materials/new");
    const save = page.getByRole("button", { name: "Save entry" });
    await expect(save).toBeDisabled();
    await page.getByLabel("Brand").fill("Probe");
    await expect(save).toBeDisabled();
    await page.getByLabel("Model").fill("One");
    await expect(save).toBeEnabled();
    await expectTouchTargets(save);
  });

  test("creates, corrects and removes an entry @write", async ({ page }) => {
    await page.goto("/materials/new");
    await page.getByLabel("Brand").fill("Specprobe");
    await page.getByLabel("Model").fill("Alpha");
    await page.getByLabel(/Length/).fill("301.5");
    await page.getByRole("button", { name: "Save entry" }).click();
    await expect(page.getByText("301.5 cm")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Specprobe Alpha" }),
    ).toBeVisible();

    // The same name again is refused with a message, and the form stays.
    await page.goto("/materials/new");
    await page.getByLabel("Brand").fill("  specprobe");
    await page.getByLabel("Model").fill("ALPHA");
    await page.getByRole("button", { name: "Save entry" }).click();
    await expect(page.getByRole("alert")).toContainText("already in the wiki");

    await openWiki(page, "?q=Specprobe");
    await row(page, "Specprobe Alpha").getByRole("button").first().click();
    await page.getByRole("button", { name: "Entry actions" }).click();
    await page.getByRole("menuitem", { name: "Edit entry" }).click();
    await page.getByLabel(/Length/).fill("305");
    await page.getByRole("button", { name: "Save entry" }).click();
    await expect(page.getByText("305 cm")).toBeVisible();
    await expect(page.getByText(/Last edited by/)).toBeVisible();

    await page.getByRole("button", { name: "Entry actions" }).click();
    await page.getByRole("menuitem", { name: "Delete entry" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page).toHaveURL(/\/materials(\?|$)/);
    await page
      .getByRole("textbox", { name: "Brand or model" })
      .fill("Specprobe");
    await expect(page.getByTestId("empty-state")).toBeVisible();
  });
});
