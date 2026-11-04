import { expect, type Page, test } from "@playwright/test";
import {
  expectNoHorizontalOverflow,
  expectTouchTargets,
} from "../support/fixture";
import { API } from "../support/signIn";

// The category tree of the wiki: category, (use, kayaks only), type, brand and
// the models of a brand. Read-only. The wiki holds the seeded catalogue, in which Pyranha
// builds nine creek kayak models.

// An older link without the use: the tree finds it.
const PATH = "?category=kayak&discipline=creek&brand=Pyranha";
const PATH_USE =
  "?category=kayak&use=whitewater&discipline=creek&brand=Pyranha";

interface UseNode {
  use: string;
  models: number;
  disciplines: { discipline: string; models: number }[];
}

/** The kayak uses and the paddle node as the API answers them. */
async function apiTree(page: Page) {
  const res = await page.request.get(`${API}/api/v1/materials/tree`);
  const tree = (await res.json()) as {
    categories: { category: string; uses?: UseNode[] }[];
  };
  return {
    uses: tree.categories.find((c) => c.category === "kayak")?.uses ?? [],
    paddle: tree.categories.find((c) => c.category === "paddle"),
  };
}

const rows = (page: Page) =>
  page.getByTestId("material-row").filter({ visible: true });

const tree = (page: Page) => page.getByRole("tree");
const item = (page: Page, name: string | RegExp) =>
  tree(page).getByRole("treeitem", { name });

test.describe("category tree on a desktop", () => {
  test.beforeEach(({ page: _page }, info) => {
    test.skip(
      info.project.name.startsWith("phone"),
      "the tree is a desktop control",
    );
  });

  test("Kayaks, Whitewater, Creek, Pyranha lists nine models and the URL and trail agree", async ({
    page,
  }) => {
    await page.goto("/materials");
    await item(page, /^Kayaks/).click();
    await expect(page.getByTestId("tree-group-note")).toContainText(
      "counted in each",
    );
    await item(page, /^Whitewater/).click();
    await item(page, /^Creek/).click();
    await item(page, /^Pyranha/).click();
    await expect(rows(page)).toHaveCount(9);
    await expect(page).toHaveURL(/category=kayak/);
    await expect(page).toHaveURL(/use=whitewater/);
    await expect(page).toHaveURL(/discipline=creek/);
    await expect(page).toHaveURL(/brand=Pyranha/);
    const trail = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(trail.getByText("Kayaks", { exact: true })).toBeVisible();
    await expect(trail.getByText("Whitewater", { exact: true })).toBeVisible();
    await expect(trail.getByText("Creek")).toBeVisible();
    await expect(trail.getByText("Pyranha", { exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByTestId("wiki-header")).toContainText("Pyranha");
    await expect(page.getByTestId("wiki-header")).toContainText("9 models");
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

  test("a link with the use opens the same path", async ({ page }) => {
    await page.goto(`/materials${PATH_USE}`);
    await expect(rows(page)).toHaveCount(9);
    await expect(item(page, /^Whitewater/)).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(item(page, /^Pyranha/)).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("picking Whitewater lists its groups and the counts match the API", async ({
    page,
  }) => {
    const { uses } = await apiTree(page);
    const whitewater = uses.find((u) => u.use === "whitewater");
    expect(whitewater?.models).toBeGreaterThan(0);
    expect(uses.map((u) => u.use)[0]).toBe("whitewater");
    await page.goto("/materials");
    await item(page, /^Kayaks/).click();
    await item(page, /^Whitewater/).click();
    await expect(page).toHaveURL(/use=whitewater/);
    await expect(page).not.toHaveURL(/discipline=/);
    for (const group of whitewater?.disciplines ?? []) {
      await expect(
        item(page, new RegExp(`^${label(group.discipline)}`)),
      ).toBeVisible();
    }
    await expect(page.getByTestId("wiki-header")).toContainText(
      `${whitewater?.models} models`,
    );
    await expect(item(page, /^Whitewater/)).toContainText(
      String(whitewater?.models),
    );
    // The list holds exactly the use's models.
    const res = await page.request.get(
      `${API}/api/v1/materials/models?category=kayak&use=whitewater&per_page=1`,
    );
    expect((await res.json()).total).toBe(whitewater?.models);
  });

  test("paddles go straight to their groups, with no use level", async ({
    page,
  }) => {
    const { paddle } = await apiTree(page);
    expect(paddle?.uses).toBeUndefined();
    await page.goto("/materials");
    await item(page, /^Paddles/).click();
    await expect(item(page, /^Whitewater/)).toBeVisible();
    await expect(item(page, /^Whitewater/)).toHaveAttribute("aria-level", "2");
    await expect(page).not.toHaveURL(/use=/);
  });

  test("the arrow keys walk the tree", async ({ page }) => {
    await page.goto("/materials");
    const kayaks = item(page, /^Kayaks/);
    await expect(kayaks).toBeVisible();
    await kayaks.focus();
    await page.keyboard.press("ArrowRight");
    await expect(kayaks).toHaveAttribute("aria-expanded", "true");
    await expect(item(page, /^Whitewater/)).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(item(page, /^Whitewater/)).toBeFocused();
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

  test("the sidebar filters narrow the list and the tree, and show as chips", async ({
    page,
  }) => {
    await page.goto(`/materials${PATH}`);
    await expect(rows(page)).toHaveCount(9);
    await page.getByRole("button", { name: "Composite" }).click();
    await expect(page).toHaveURL(/construction=composite/);
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await page.locator(".MuiChip-deleteIcon").click();
    await expect(rows(page)).toHaveCount(9);
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
  test.beforeEach(({ page: _page }, info) => {
    test.skip(
      !info.project.name.startsWith("phone") &&
        !info.project.name.startsWith("small"),
      "phone control",
    );
  });

  test("drills Kayaks, Whitewater, Creek, Pyranha, filters the list and shows the path @small", async ({
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
    await sheet.getByRole("button", { name: /^Whitewater/ }).click();
    await expect(sheet.getByRole("button", { name: /^Racing/ })).toBeHidden();
    await expect(
      sheet.getByRole("button", { name: /^All Whitewater/ }),
    ).toBeVisible();
    await sheet.getByRole("button", { name: /^Creek/ }).click();
    await sheet.getByRole("button", { name: /^Pyranha/ }).click();
    await expect(sheet).toBeHidden();
    await expect(rows(page)).toHaveCount(9);
    await expect(page).toHaveURL(/brand=Pyranha/);
    await expect(page).toHaveURL(/use=whitewater/);
    const trail = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(trail.getByText("Kayaks", { exact: true })).toBeVisible();
    await expect(trail.getByText("Whitewater", { exact: true })).toBeVisible();
    await expect(trail.getByText("Pyranha", { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("All and Back climb the levels; All picks the whole level", async ({
    page,
  }) => {
    await page.goto("/materials");
    await page.getByTestId("browse-button").click();
    const sheet = page.getByRole("dialog", { name: "Browse" });
    await sheet.getByRole("button", { name: /^Kayaks/ }).click();
    await sheet.getByRole("button", { name: /^Whitewater/ }).click();
    await sheet.getByRole("button", { name: "Back" }).first().click();
    await expect(sheet.getByRole("button", { name: /^Racing/ })).toBeVisible();
    await sheet.getByRole("button", { name: "Back" }).first().click();
    await expect(sheet.getByRole("button", { name: /^Canoes/ })).toBeVisible();
    await sheet.getByRole("button", { name: /^Kayaks/ }).click();
    await sheet.getByRole("button", { name: /^Whitewater/ }).click();
    await sheet.getByRole("button", { name: /^All Whitewater/ }).click();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/use=whitewater/);
    await expect(page).not.toHaveURL(/discipline=/);
    await page.getByTestId("browse-button").click();
    await sheet.getByRole("button", { name: "Back" }).first().click();
    await sheet.getByRole("button", { name: /^All Kayaks/ }).click();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/category=kayak/);
    await expect(page).not.toHaveURL(/use=/);
    // A step of the path is a way back up.
    await page.goto(`/materials${PATH}`);
    const trail = page.getByRole("navigation", { name: "Breadcrumb" });
    await trail.getByRole("button", { name: "Kayaks", exact: true }).click();
    await expect(page).not.toHaveURL(/brand=/);
  });
});

const label = (discipline: string) =>
  discipline.charAt(0).toUpperCase() + discipline.slice(1).replace(/_/g, " ");

test.describe("browse sheet on a phone: paddles", () => {
  test("a paddle category has no use level", async ({ page }, info) => {
    test.skip(
      !info.project.name.startsWith("phone") &&
        !info.project.name.startsWith("small"),
      "phone control",
    );
    await page.goto("/materials");
    await page.getByTestId("browse-button").click();
    const sheet = page.getByRole("dialog", { name: "Browse" });
    await sheet.getByRole("button", { name: /^Paddles/ }).click();
    await expect(
      sheet.getByRole("button", { name: /^All Paddles/ }),
    ).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: /^Whitewater/ }),
    ).toBeVisible();
    await expect(sheet.getByRole("button", { name: /^Racing/ })).toBeHidden();
  });
});
