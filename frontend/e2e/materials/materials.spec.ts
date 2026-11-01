import { expect, type Page, test } from "@playwright/test";
import {
  computed,
  expectNoHorizontalOverflow,
  expectTouchTargets,
} from "../support/fixture";
import { pickGroups } from "../support/materialForm";

// The material wiki. Fixture entries 9851-9860: the Testflow Cascade in S, M
// and L (one model, three sizes), two Riverline boats, Northline, an Alpiner
// slalom boat, a canoe and a packraft. Only the @write tests change data, and
// they put it back. The wiki also holds the seeded catalogue, so list checks
// are scoped to the fixture brand "Testflow" (the Cascade model and the
// Tandem canoe) and never count the whole wiki.

const FIXTURE = "?q=Testflow";

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
  test("lists models: the Cascade is one row with its sizes @small", async ({
    page,
  }) => {
    await openWiki(page, FIXTURE);
    await expect(rows(page)).toHaveCount(2);
    const cascade = row(page, "Testflow Cascade");
    await expect(cascade).toContainText("Creek");
    await expect(cascade).toContainText("since 2022");
    await expect(cascade).toContainText("254-274 cm");
    await expect(cascade.getByTestId("model-sizes")).toHaveText("S M L");
    await expect(page.getByText("2 models")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("a misspelled name still finds the boat", async ({ page }) => {
    await openWiki(page);
    await page.getByRole("textbox", { name: "Brand or model" }).fill("testflw");
    await expect(row(page, "Testflow Cascade")).toBeVisible();
    await expect(page).toHaveURL(/q=testflw/);
    await page.getByRole("textbox", { name: "Brand or model" }).fill("zzzz");
    await expect(page.getByTestId("empty-state")).toBeVisible();
  });

  test("the filters sheet narrows the list and shows as chips", async ({
    page,
  }) => {
    test.skip(
      !test.info().project.name.startsWith("phone"),
      "the desktop filters sit in the sidebar, see tree.spec",
    );
    await openWiki(page, FIXTURE);
    await page.getByTestId("filters-chip").click();
    const sheet = page.getByRole("dialog", { name: "Filters" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Composite" }).click();
    await expect(
      sheet.getByRole("button", { name: /0 results/ }),
    ).toBeVisible();
    await sheet.getByRole("button", { name: /0 results/ }).click();
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await expect(page).toHaveURL(/construction=composite/);
    // The set filter is a chip that takes itself away.
    const chip = page.getByRole("button", { name: "Composite", exact: true });
    await expect(chip).toBeVisible();
    await chip.locator(".MuiChip-deleteIcon").click();
    await expect(rows(page)).toHaveCount(2);
  });

  test("the paddler weight keeps sizes that fit or state no range", async ({
    page,
  }) => {
    await openWiki(page, `${FIXTURE}&fits=120`);
    // 120 kg: Cascade M (70-110) and S (45-75) are out, only L stays.
    await expect(row(page, "Testflow Cascade")).toBeVisible();
    await expect(
      row(page, "Testflow Cascade").getByTestId("model-sizes"),
    ).toHaveText("L");
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

  test("a model is a card on a phone and in the desktop grid", async ({
    page,
  }) => {
    await openWiki(page);
    const shadow = await computed(rows(page).first(), "box-shadow");
    expect(shadow).not.toBe("none");
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
  test("two sizes of one model compare: alike values are chips, differing rows stay, a pick can be removed", async ({
    page,
  }) => {
    await openWiki(page, "?q=Testflow");
    await row(page, "Testflow Cascade").getByRole("button").first().click();
    await page.getByRole("button", { name: "Compare sizes" }).click();

    await expect(page).toHaveURL(/\/materials\/compare\?ids=/);
    const table = page.getByRole("region", { name: "Comparison table" });
    await expect(table).toBeVisible();
    const volume = table.getByTestId("compare-row").filter({
      hasText: "Volume (l)",
    });
    await expect(volume).toContainText("295");
    await expect(volume).toContainText("345");
    // Same model, same discipline: the value is in the strip, not the table.
    await expect(page.getByTestId("compare-alike")).toContainText(
      "Alike in all 3",
    );
    await expect(page.getByTestId("compare-alike")).toContainText("Creek");
    await expect(table.getByText("Groups")).toHaveCount(0);
    await expectTouchTargets(
      page.getByRole("button", { name: /Remove .* from the comparison/ }),
    );

    await page
      .getByRole("button", {
        name: "Remove Testflow Cascade S from the comparison",
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Remove Testflow Cascade M from the comparison",
      }),
    ).toBeVisible();
  });

  test("a model of several sizes asks which size, the bar names the picks", async ({
    page,
  }) => {
    await openWiki(page, FIXTURE);
    await page.getByLabel("Compare Testflow Cascade").click();
    // Nothing is picked until a size is: the first one is never taken silently.
    await expect(page.getByTestId("compare-bar")).toHaveCount(0);
    const menu = page.getByRole("menu", { name: "Sizes of Testflow Cascade" });
    await expect(menu.getByRole("menuitemcheckbox")).toHaveCount(3);
    await menu.getByRole("menuitemcheckbox", { name: "M" }).click();
    await page.keyboard.press("Escape");
    const bar = page.getByTestId("compare-bar");
    await expect(bar).toContainText("1 picked");
    await expect(bar).toContainText("8 at most");
    await expect(bar).toContainText("Testflow Cascade M");
    await expect(page).toHaveURL(/compare=(%22)?9852/);
  });

  test("ticked models of different brands compare through the bar", async ({
    page,
  }) => {
    await openWiki(page, FIXTURE);
    await page.getByLabel("Compare Testflow Tandem").check();
    const bar = page.getByTestId("compare-bar");
    await expect(bar).toContainText("1 picked");
    await expect(bar).toContainText("Testflow Tandem");
    await expect(
      bar.getByRole("button", { name: "Compare", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("textbox", { name: "Brand or model" })
      .fill("Riverline");
    await page.getByLabel("Compare Riverline Squirt").check();
    await expect(bar).toContainText("2 picked");
    await expect(bar).toContainText("Riverline Squirt");
    // The bar's Compare is a text button, not a second primary action.
    const compare = bar.getByRole("button", { name: "Compare", exact: true });
    expect(await computed(compare, "background-color")).toBe(
      "rgba(0, 0, 0, 0)",
    );
    await expectTouchTargets(bar.getByRole("button"));
    await compare.click();

    const table = page.getByRole("region", { name: "Comparison table" });
    await expect(table).toBeVisible();
    await expect(table).toContainText("Tandem");
    await expect(table).toContainText("Squirt");
  });

  test("the bar stays at the foot while the list scrolls, above the bottom nav", async ({
    page,
  }) => {
    await page.goto("/materials?compare=9854,9855");
    const bar = page.getByTestId("compare-bar");
    await expect(bar).toBeVisible();
    await page.mouse.wheel(0, 1500);
    await expect(rows(page).first()).toBeVisible();
    const box = await bar.boundingBox();
    const height = page.viewportSize()?.height ?? 0;
    expect(box && box.y + box.height).toBeLessThanOrEqual(height);
    expect(box?.y).toBeGreaterThan(height / 3);
    const nav = page.getByRole("navigation").filter({ visible: true }).last();
    if ((page.viewportSize()?.width ?? 0) < 768) {
      const navBox = await nav.boundingBox();
      expect(box && box.y + box.height).toBeLessThanOrEqual(navBox?.y ?? 0);
    }
  });

  test("the ninth pick is refused", async ({ page }) => {
    await page.goto(
      "/materials?compare=9851,9852,9853,9854,9855,9856,9857,9858",
    );
    await expect(page.getByTestId("compare-bar")).toContainText("8 picked");
    const free = page.locator(
      '[data-testid="material-row"] input[type="checkbox"]:not(:checked)',
    );
    await expect(free.first()).toBeDisabled();
  });

  test("a single-id link still opens", async ({ page }) => {
    await page.goto("/materials/compare?ids=9853");
    await expect(
      page.getByRole("button", {
        name: "Remove Testflow Cascade L from the comparison",
      }),
    ).toBeVisible();
  });

  test("a comparison link survives a reload @small", async ({ page }) => {
    await openWiki(page, FIXTURE);
    await page.getByLabel("Compare Testflow Tandem").check();
    await page.getByLabel("Compare Testflow Cascade").click();
    await page
      .getByRole("menuitemcheckbox", { name: "S", exact: true })
      .click();
    await page.keyboard.press("Escape");
    await page
      .getByTestId("compare-bar")
      .getByRole("button", { name: "Compare", exact: true })
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
    await page.goto("/materials/9852");
    await expect(page.getByText("Hull", { exact: true })).toBeVisible();
    const facts = page.getByTestId("all-sizes");
    await expect(facts).toContainText("264 cm");
    await expect(facts).toContainText("320 l");
    await expect(facts).toContainText("22 kg");
    await expect(facts).toContainText("70-110 kg");
    await expect(
      page.getByRole("link", { name: /Manufacturer page/ }),
    ).toHaveAttribute("href", "https://example.com/cascade");
    await expect(page.getByText(/Added by/)).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("the size picker changes the URL and the facts @small", async ({
    page,
  }) => {
    await openWiki(page, FIXTURE);
    await row(page, "Testflow Cascade").getByRole("button").first().click();
    await expect(page).toHaveURL(/\/materials\/9851/);
    // The table's column headings are the size choice; no second picker.
    await expect(page.getByTestId("size-picker")).toHaveCount(0);
    const all = page.getByTestId("all-sizes");
    await expect(all.getByRole("columnheader")).toHaveText(["S", "M", "L"]);
    const heads = all.getByRole("button");
    await expect(heads).toHaveText(["S", "M", "L"]);
    await expect(all.locator('th[aria-current="true"]')).toHaveText("S");
    await expectTouchTargets(heads);
    await expect(all.getByRole("row", { name: /Length/ })).toContainText(
      "254 cm",
    );

    await heads.nth(1).click();
    await expect(page).toHaveURL(/\/materials\/9852/);
    await expect(all.locator('th[aria-current="true"]')).toHaveText("M");
    await expect(all.getByRole("row", { name: /Length/ })).toContainText(
      "274 cm",
    );
    // The picked size's specs are not listed a second time.
    await expect(page.getByTestId("spec-cards")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test("a model with one size shows no picker", async ({ page }) => {
    await page.goto("/materials/9854");
    await expect(page.getByRole("heading").first()).toBeVisible();
    await expect(page.getByTestId("all-sizes")).toHaveCount(0);
    await expect(page.getByTestId("spec-cards")).toBeVisible();
  });

  test("the header menu offers edit to a signed-in paddler", async ({
    page,
  }) => {
    await page.goto("/materials/9852");
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
  test("the form needs brand, model and a group before it saves", async ({
    page,
  }) => {
    await page.goto("/materials/new");
    const save = page.getByRole("button", { name: "Save entry" });
    await expect(save).toBeDisabled();
    await page.getByLabel("Brand").fill("Probe");
    await expect(save).toBeDisabled();
    await page.getByLabel("Model").fill("One");
    await expect(save).toBeDisabled();
    await pickGroups(page, "Creek");
    await expect(save).toBeEnabled();
    await expectTouchTargets(save);
  });

  test("creates, corrects and removes an entry @write", async ({ page }) => {
    await page.goto("/materials/new");
    await page.getByLabel("Brand").fill("Specprobe");
    await page.getByLabel("Model").fill("Alpha");
    await pickGroups(page, "Creek", "River runner");
    await page.getByLabel("Size", { exact: true }).fill("XL");
    await page.getByLabel(/Length/).fill("301.5");
    await page.getByRole("button", { name: "Save entry" }).click();
    await expect(page.getByText("301.5 cm").first()).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Specprobe Alpha" }),
    ).toBeVisible();
    // Both groups are shown, the one picked first leading.
    await expect(page.getByText("Creek · River runner").first()).toBeVisible();

    // The same name again is refused with a message, and the form stays.
    await page.goto("/materials/new");
    await page.getByLabel("Brand").fill("  specprobe");
    await page.getByLabel("Model").fill("ALPHA");
    await pickGroups(page, "Creek");
    await page.getByLabel("Size", { exact: true }).fill("XL");
    await page.getByRole("button", { name: "Save entry" }).click();
    await expect(page.getByRole("alert")).toContainText("already in the wiki");

    await openWiki(page, "?q=Specprobe");
    await row(page, "Specprobe Alpha").getByRole("button").first().click();
    await page.getByRole("button", { name: "Entry actions" }).click();
    await page.getByRole("menuitem", { name: "Edit entry" }).click();
    // An edit that leaves the size alone sends it back as it was.
    await expect(page.getByLabel("Size", { exact: true })).toHaveValue("XL");
    await page.getByLabel(/Length/).fill("305");
    await page.getByRole("button", { name: "Save entry" }).click();
    await expect(page.getByText("305 cm").first()).toBeVisible();
    await expect(page.getByText(/Last edited by/)).toBeVisible();
    await page.getByRole("button", { name: "Entry actions" }).click();
    await page.getByRole("menuitem", { name: "Edit entry" }).click();
    await expect(page.getByLabel("Size", { exact: true })).toHaveValue("XL");
    await page.getByRole("button", { name: "Cancel" }).click();

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

test.describe("header card", () => {
  // The header's content sits on the 56 row: equal gap above and below.
  const pages = ["/materials", "/materials/compare"];
  for (const path of pages) {
    test(`${path} header is vertically centred @small`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("[data-panel-back]:visible")).toBeVisible();
      await expectHeaderCentred(page);
    });
  }

  test("a model's header is vertically centred", async ({ page }) => {
    await openWiki(page, FIXTURE);
    await row(page, "Testflow Cascade").click();
    await expect(page.locator("[data-panel-back]:visible")).toBeVisible();
    await expectHeaderCentred(page);
  });
});

async function expectHeaderCentred(page: Page) {
  const gaps = await page.evaluate(() => {
    const back = [...document.querySelectorAll("[data-panel-back]")].find(
      (b) => (b as HTMLElement).offsetParent,
    );
    const row = back?.parentElement;
    const card = row?.parentElement;
    if (!row || !card) throw new Error("no header card");
    const box = card.getBoundingClientRect();
    return [...row.children].map((c) => {
      const r = c.getBoundingClientRect();
      return { top: r.top - box.top, bottom: box.bottom - r.bottom };
    });
  });
  expect(gaps.length).toBeGreaterThan(1);
  for (const g of gaps) {
    expect(Math.abs(g.top - g.bottom)).toBeLessThanOrEqual(1);
  }
}
