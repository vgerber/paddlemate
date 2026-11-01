import { expect, type Page, test } from "@playwright/test";
import {
  expectNoHorizontalOverflow,
  expectTouchTargets,
} from "../support/fixture";

// The category tree of the wiki: category, type, brand and the models of a
// brand. Read-only. The wiki holds the seeded catalogue, in which Pyranha
// builds nine creek kayak models.

const PATH = "?category=kayak&discipline=creek&brand=Pyranha";

const rows = (page: Page) =>
  page.getByTestId("material-row").filter({ visible: true });

const tree = (page: Page) => page.getByRole("tree");
const item = (page: Page, name: string | RegExp) =>
  tree(page).getByRole("treeitem", { name });

test.describe("category tree on a desktop", () => {
  test.beforeEach(({}, info) => {
    test.skip(
      info.project.name.startsWith("phone"),
      "the tree is a desktop control",
    );
  });

  test("Kayaks, Creek, Pyranha lists nine models and the URL and trail agree", async ({
    page,
  }) => {
    await page.goto("/materials");
    await item(page, /^Kayaks/).click();
    await item(page, /^Creek/).click();
    await item(page, /^Pyranha/).click();
    await expect(rows(page)).toHaveCount(9);
    await expect(page).toHaveURL(/category=kayak/);
    await expect(page).toHaveURL(/discipline=creek/);
    await expect(page).toHaveURL(/brand=Pyranha/);
    const trail = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(trail.getByText("Kayaks")).toBeVisible();
    await expect(trail.getByText("Creek")).toBeVisible();
    await expect(trail.getByText("Pyranha")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pyranha");
    await expect(page.getByTestId("wiki-counts")).toContainText("9 models");
    // The path is a link: the back button undoes the last pick.
    await page.goBack();
    await expect(page).not.toHaveURL(/brand=/);
  });

  test("a link opens the tree on its path with the brand's models below it", async ({
    page,
  }) => {
    await page.goto(`/materials${PATH}`);
    await expect(rows(page)).toHaveCount(9);
    await expect(item(page, /^Pyranha/)).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(item(page, /^Pyranha/)).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(item(page, /^Scorch/).first()).toBeVisible();
    await item(page, /^Scorch\b/)
      .first()
      .click();
    await expect(page).toHaveURL(/\/materials\/\d+/);
  });

  test("the arrow keys walk the tree", async ({ page }) => {
    await page.goto("/materials");
    const kayaks = item(page, /^Kayaks/);
    await expect(kayaks).toBeVisible();
    await kayaks.focus();
    await page.keyboard.press("ArrowRight");
    await expect(kayaks).toHaveAttribute("aria-expanded", "true");
    await expect(item(page, /^Creek/)).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(item(page, /^Creek/)).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(kayaks).toBeFocused();
    await page.keyboard.press("End");
    await expect(item(page, /^Paddles/)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(kayaks).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(kayaks).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/category=kayak/);
    // One tab stop for the whole tree.
    const stops = await tree(page)
      .getByRole("treeitem")
      .evaluateAll((els) => els.filter((el) => el.tabIndex === 0).length);
    expect(stops).toBe(1);
  });

  test("the tree is tall enough to touch and the page has no sideways scroll", async ({
    page,
  }) => {
    await page.goto(`/materials${PATH}`);
    await expect(rows(page)).toHaveCount(9);
    await expectTouchTargets(tree(page).getByRole("treeitem"));
    await expectNoHorizontalOverflow(page);
  });

  test("the page uses the width of a wide window", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/materials${PATH}`);
    await expect(rows(page)).toHaveCount(9);
    const list = await page.getByTestId("material-list").boundingBox();
    expect(list?.width ?? 0).toBeGreaterThan(880);
    const cards = await rows(page).evaluateAll((els) => {
      const tops = new Set(
        els.map((el) => Math.round(el.getBoundingClientRect().top)),
      );
      return { rows: tops.size, count: els.length };
    });
    expect(cards.rows, "cards sit in several columns").toBeLessThan(
      cards.count,
    );
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("browse sheet on a phone", () => {
  test.beforeEach(({}, info) => {
    test.skip(
      !info.project.name.startsWith("phone") &&
        !info.project.name.startsWith("small"),
      "phone control",
    );
  });

  test("drills Kayaks, Creek, Pyranha, filters the list and shows the path @small", async ({
    page,
  }) => {
    await page.goto("/materials");
    await page.getByTestId("browse-button").click();
    const sheet = page.getByRole("dialog", { name: "Browse" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: /^Kayaks/ }).click();
    await expect(
      sheet.getByRole("button", { name: /^All Kayaks/ }),
    ).toBeVisible();
    await sheet.getByRole("button", { name: /^Creek/ }).click();
    await sheet.getByRole("button", { name: /^Pyranha/ }).click();
    await expect(sheet).toBeHidden();
    await expect(rows(page)).toHaveCount(9);
    await expect(page).toHaveURL(/brand=Pyranha/);
    const trail = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(trail.getByText("Kayaks")).toBeVisible();
    await expect(trail.getByText("Pyranha")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("All and Back climb the levels; All picks the whole level", async ({
    page,
  }) => {
    await page.goto("/materials");
    await page.getByTestId("browse-button").click();
    const sheet = page.getByRole("dialog", { name: "Browse" });
    await sheet.getByRole("button", { name: /^Kayaks/ }).click();
    await sheet.getByRole("button", { name: "Back to Browse" }).click();
    await expect(sheet.getByRole("button", { name: /^Canoes/ })).toBeVisible();
    await sheet.getByRole("button", { name: /^Kayaks/ }).click();
    await sheet.getByRole("button", { name: /^All Kayaks/ }).click();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/category=kayak/);
    await expect(page).not.toHaveURL(/discipline=/);
    // A step of the path is a way back up.
    await page.goto(`/materials${PATH}`);
    const trail = page.getByRole("navigation", { name: "Breadcrumb" });
    await trail.getByRole("button", { name: "Kayaks" }).click();
    await expect(page).not.toHaveURL(/brand=/);
  });
});
