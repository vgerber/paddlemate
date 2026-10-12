import { expect, type Page, test } from "@playwright/test";
import { computed, FIX, gotoSection } from "../support/fixture";

// The section panel's spacing system on a desktop: 8 gutter, 16 inside a
// card, text on the 24 line, rows 56, header 104 (doc/design.md, Layout).

test.skip(
  ({ viewport }) => (viewport?.width ?? 0) < 768,
  "the two-pane panel starts at md",
);

const vis = (page: Page, id: string) =>
  page.getByTestId(id).filter({ visible: true });

const tab = (page: Page, name: string) =>
  page.getByRole("tab", { name, exact: true }).filter({ visible: true });

async function menuLabels(page: Page) {
  await page
    .getByRole("button", { name: "Section actions" })
    .filter({ visible: true })
    .click();
  const labels = await page.getByRole("menuitem").allTextContents();
  await page.keyboard.press("Escape");
  return labels;
}

test.describe("panel spacing", () => {
  test("the header is 104 high and the first label sits on the 24 line", async ({
    page,
  }) => {
    await gotoSection(page, "upper");
    const back = page
      .getByRole("button", { name: "Back" })
      .filter({ visible: true })
      .first();
    const header = back.locator("xpath=../..");
    const box = await header.boundingBox();
    const first = await tab(page, "Features").boundingBox();
    if (!box || !first) throw new Error("no boxes");
    expect(Math.round(box.height)).toBe(104);
    // The tab has 4px padding, its label starts at +24.
    expect(Math.round(first.x - box.x)).toBe(20);
    const b = await back.boundingBox();
    expect(Math.round((b?.x ?? 0) - box.x)).toBe(12);
  });

  test("on every tab the first card is 8 under the header and 8 from the edges", async ({
    page,
  }) => {
    await gotoSection(page, "upper");
    for (const name of ["Features", "Logs", "Notes", "Sources"]) {
      await tab(page, name).click();
      const pane = vis(page, "tab-pane");
      const p = await pane.boundingBox();
      if (!p) throw new Error("no pane");
      expect(await computed(pane, "padding-top"), `${name} top`).toBe("8px");
      expect(await computed(pane, "padding-left"), `${name} left`).toBe("8px");
      expect(await computed(pane, "padding-right"), `${name} right`).toBe(
        "8px",
      );
    }
  });

  test("the features rows are 56 high and the card has no controls", async ({
    page,
  }) => {
    await gotoSection(page, "upper");
    const card = vis(page, "features-card");
    const rows = card.locator("[data-row]");
    await expect(rows).toHaveCount(2);
    for (const h of await rows.evaluateAll((els) =>
      els.map((e) => Math.round(e.getBoundingClientRect().height)),
    ))
      expect(h).toBe(56);
    await expect(card.getByRole("button")).toHaveCount(0);
    const count = await card.getByTestId("features-count").boundingBox();
    expect(Math.round(count?.height ?? 0)).toBe(48);
  });

  test("the empty features card is about 116 high, the docked action sits on the card edges", async ({
    page,
  }) => {
    await page.goto(`/?waterway=9010&section=9171`);
    const card = vis(page, "features-card");
    await expect(card).toBeVisible();
    await expect(card.getByTestId("features-count")).toHaveCount(0);
    const h = (await card.boundingBox())?.height ?? 0;
    expect(h).toBeGreaterThan(110);
    expect(h).toBeLessThan(125);
    const dock = page
      .getByRole("button", { name: "New feature" })
      .filter({ visible: true });
    const d = await dock.boundingBox();
    const c = await card.boundingBox();
    if (!d || !c) throw new Error("no boxes");
    expect(Math.round(d.x)).toBe(Math.round(c.x));
    expect(Math.round(d.width)).toBe(Math.round(c.width));
  });

  test("river state rows have no chevrons and the card hugs its rows", async ({
    page,
  }) => {
    await gotoSection(page, "upper");
    const state = vis(page, "river-state");
    await expect(state).toBeVisible();
    const rows = state.locator('[data-testid^="river-state-"]');
    expect(await rows.count()).toBeGreaterThan(0);
    await expect(state.locator('[data-testid="ChevronRightIcon"]')).toHaveCount(
      0,
    );
    const slot = await vis(page, "river-state-slot").boundingBox();
    const card = await state.locator("> div").first().boundingBox();
    expect(card?.height ?? 0).toBeLessThan((slot?.height ?? 0) - 40);
  });
});

test.describe("header menu", () => {
  test("lists the actions of each tab in groups", async ({ page }) => {
    await page.goto(`/?waterway=${FIX.waterway}&section=${FIX.sections.upper}`);
    expect(await menuLabels(page)).toEqual([
      "Add favorite",
      "Start descent",
      "Log descent",
      "Show proposed features",
    ]);
    await tab(page, "Logs").click();
    expect(await menuLabels(page)).toEqual(["Add favorite", "Start descent"]);
    await page.goto(`/?waterway=9010&section=9171`);
    expect(await menuLabels(page)).toEqual([
      "Add favorite",
      "Start descent",
      "Log descent",
      "Edit grade",
      "Delete grade",
      "Show proposed features",
    ]);
    await tab(page, "Sources").click();
    expect(await menuLabels(page)).toEqual([
      "Add favorite",
      "Start descent",
      "Log descent",
      "Edit grade",
      "Delete grade",
    ]);
  });

  test("a hairline divides the groups", async ({ page }) => {
    await page.goto(`/?waterway=9010&section=9171`);
    await page
      .getByRole("button", { name: "Section actions" })
      .filter({ visible: true })
      .click();
    const edit = page.getByRole("menuitem", { name: "Edit grade" });
    const show = page.getByRole("menuitem", { name: "Show proposed features" });
    const log = page.getByRole("menuitem", { name: "Log descent" });
    expect(await computed(edit, "border-top-width")).toBe("1px");
    expect(await computed(show, "border-top-width")).toBe("1px");
    expect(await computed(log, "border-top-width")).toBe("0px");
  });
});
