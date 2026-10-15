import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  appReady,
  computed,
  expectTouchTargets,
  FIX,
  gotoSection,
} from "../support/fixture";

// Design gaps in the river panel, the section lists and the map page chrome:
// where the tabs live, the row anatomy, one gutter for every list, the
// header menu, and the floating buttons. Fixture: Test River with seven
// sections, a gauge with its credit, and notes (one merged).

const TEAL = "rgb(14, 116, 144)";

const tab = (page: Page, name: string) =>
  page.getByRole("tab", { name, exact: true });
const tabNames = (page: Page) =>
  page.locator("button.MuiTab-root:visible").allTextContents();
const pane = (page: Page) => page.locator("[data-testid=tab-pane]:visible");
const rows = (page: Page) => page.locator(".MuiListItemButton-root:visible");
const row = (page: Page, name: string) =>
  rows(page).filter({ hasText: name }).first();

async function openRiver(page: Page) {
  await page.goto(`/?waterway=${FIX.waterway}`);
  await appReady(page);
  await expect(rows(page).first()).toBeVisible();
}

async function box(locator: Locator) {
  const b = await locator.first().boundingBox();
  if (!b) throw new Error("element has no box");
  return b;
}

/** Distance from the tab pane's left edge to the element's left edge. */
async function gutter(page: Page, locator: Locator) {
  return Math.round((await box(locator)).x - (await box(pane(page))).x);
}

test.describe("tabs", () => {
  test("the river has Sections, Gauges and Notes", async ({ page }) => {
    await openRiver(page);
    expect(await tabNames(page)).toEqual(["Sections", "Gauges", "Notes"]);
  });

  test("the section has Features, Logs, Notes and Sources", async ({
    page,
  }) => {
    await gotoSection(page, "lower");
    expect(await tabNames(page)).toEqual([
      "Features",
      "Logs",
      "Notes",
      "Sources",
    ]);
    await tab(page, "Sources").click();
    await expect(tab(page, "Sources")).toHaveAttribute("aria-selected", "true");
    await expect(
      page
        .locator("[data-testid=sources]:visible")
        .or(page.getByText("No sources yet.").locator(":visible")),
    ).toBeVisible();
  });
});

test.describe("section rows", () => {
  test("a row is 56px or more with a 500 weight 15px name and no place line", async ({
    page,
  }) => {
    await openRiver(page);
    const r = row(page, "Lower Test");
    expect(
      Number.parseFloat(await computed(r, "height")),
    ).toBeGreaterThanOrEqual(56);
    const name = r.getByText("Lower Test", { exact: true });
    expect(await computed(name, "font-size")).toBe("15px");
    expect(await computed(name, "font-weight")).toBe("500");
    expect(await r.innerText(), "no place under the name").not.toContain("·");
  });

  test("cards are 8px apart", async ({ page }) => {
    await openRiver(page);
    const boxes = await rows(page).evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect()).map((b) => [b.top, b.bottom]),
    );
    expect(boxes.length).toBeGreaterThan(2);
    for (const [i, b] of boxes.entries()) {
      if (i > 0) expect(b[0] - boxes[i - 1][1]).toBe(8);
    }
  });

  test("the grade is a 6px tag on the quiet ground, not a pill", async ({
    page,
  }) => {
    await openRiver(page);
    const tag = page.locator("[data-testid=grade-tag]:visible").first();
    await expect(tag).toBeVisible();
    expect(await computed(tag, "border-top-left-radius")).toBe("6px");
    expect(await computed(tag, "background-color")).toBe("rgb(246, 248, 249)");
    expect(await computed(tag, "height")).toBe("20px");
    expect(await computed(tag, "font-weight")).toBe("600");
  });

  test("the columns are 30, 46 and 74px wide", async ({ page }, info) => {
    test.skip(info.project.name === "small", "the 320px row stacks");
    await openRiver(page);
    const columns = await computed(
      row(page, "Lower Test"),
      "grid-template-columns",
    );
    expect(columns.split(" ").slice(1).join(" ")).toBe("30px 46px 74px");
  });

  test("the boat count is 13px and 500", async ({ page }) => {
    await openRiver(page);
    const count = page
      .locator("[data-testid=boat-count]:has(svg):visible")
      .first();
    expect(await computed(count, "font-size")).toBe("13px");
    expect(await computed(count, "font-weight")).toBe("500");
  });
});

test.describe("list gutters", () => {
  test("sections, gauges and notes start 12px from the pane edge", async ({
    page,
  }) => {
    await openRiver(page);
    expect(await gutter(page, row(page, "Lower Test")), "sections").toBe(12);
    await tab(page, "Gauges").click();
    await expect(
      page.locator("[data-testid=gauge-card]:visible").first(),
    ).toBeVisible();
    expect(
      await gutter(page, page.locator("[data-testid=gauge-card]:visible")),
      "gauges",
    ).toBe(12);
    await tab(page, "Notes").click();
    await expect(
      page.locator("[data-testid=note-card]:visible").first(),
    ).toBeVisible();
    expect(
      await gutter(page, page.locator("[data-testid=note-card]:visible")),
      "notes",
    ).toBe(12);
  });

  test("search results start 12px from the list edge", async ({ page }) => {
    await page.goto("/");
    await appReady(page);
    const open = page.getByRole("button", { name: "Open search panel" });
    if (await open.isVisible()) await open.click();
    await page.getByRole("textbox").first().fill("Test");
    const first = page.locator(".MuiListItemButton-root:visible").first();
    await expect(first).toBeVisible();
    const edge = await first.evaluate((el) => {
      let p: HTMLElement | null = el.parentElement;
      while (p && getComputedStyle(p).overflowY !== "auto") p = p.parentElement;
      return p ? p.getBoundingClientRect().left : 0;
    });
    const left = (await box(first)).x;
    expect(Math.round(left - edge)).toBe(12);
  });
});

test.describe("gauge credit", () => {
  test("the station and the credit are secondary text, not teal links", async ({
    page,
  }) => {
    await openRiver(page);
    await tab(page, "Gauges").click();
    const credit = page.locator("[data-testid=gauge-attribution]:visible");
    await expect(credit.first()).toBeVisible();
    const links = credit.first().locator("a");
    const n = await links.count();
    for (let i = 0; i < n; i++) {
      expect(await computed(links.nth(i), "color")).not.toBe(TEAL);
    }
  });
});

test.describe("notes", () => {
  test("a note reads at 15px with 14px padding; a folded one is labelled Merged", async ({
    page,
  }) => {
    await openRiver(page);
    await tab(page, "Notes").click();
    const card = page.locator("[data-testid=note-card]:visible").first();
    await expect(card).toBeVisible();
    expect(await computed(card, "padding-left")).toBe("14px");
    expect(await computed(card, "padding-top")).toBe("12px");
    const body = card.locator("[data-testid=note-body]");
    expect(await computed(body, "font-size")).toBe("15px");
    const merged = pane(page).getByText("Merged", { exact: true });
    await expect(merged).toBeVisible();
    expect(await computed(merged, "font-weight")).toBe("500");
    await expect(pane(page).getByText("merged", { exact: true })).toHaveCount(
      0,
    );
  });

  test("the composer is 48px tall", async ({ page }) => {
    await openRiver(page);
    await tab(page, "Notes").click();
    const field = page
      .getByPlaceholder("Add a note")
      .locator("xpath=..")
      .locator("visible=true");
    await expect(field).toBeVisible();
    expect((await box(field)).height).toBeGreaterThanOrEqual(48);
  });
});

test.describe("section actions", () => {
  test("one menu in the header holds favorite, proposed, start and log", async ({
    page,
  }) => {
    await gotoSection(page, "lower");
    const menu = page.getByRole("button", { name: "Section actions" });
    await expect(menu).toBeVisible();
    await expectTouchTargets(menu);
    await menu.click();
    const labels = await page.getByRole("menuitem").allTextContents();
    expect(labels).toContain("Show proposed features");
    expect(labels).toContain("Start descent");
    expect(labels).toContain("Log descent");
    expect(labels.some((l) => /favorite/.test(l))).toBe(true);
    expect(labels).not.toContain("Add feature");
    expect(labels).not.toContain("New feature");
  });

  test("no loose icons or buttons sit beside the chart or in the header", async ({
    page,
  }) => {
    await gotoSection(page, "lower");
    for (const name of [
      "Show proposed features",
      "Add to favorites",
      "Start",
    ]) {
      await expect(
        page.getByRole("button", { name, exact: true }),
        name,
      ).toHaveCount(0);
    }
    await expect(
      page.getByRole("button", { name: "Log descent", exact: true }),
    ).toHaveCount(0);
  });

  test("the one primary add is New feature", async ({ page }, info) => {
    await gotoSection(page, "lower");
    const add = page.getByRole("button", { name: "New feature", exact: true });
    await expect(add.first()).toBeVisible();
    await expect(add).toHaveCount(1);
    if (info.project.name !== "desktop") {
      expect(await add.first().getAttribute("aria-haspopup")).toBeNull();
    }
  });
});

test.describe("map page chrome", () => {
  test("a phone search shows no New river button", async ({ page }, info) => {
    test.skip(info.project.name === "desktop", "the desktop docks it");
    await page.goto("/");
    await appReady(page);
    await page.getByRole("button", { name: "Open search panel" }).click();
    await expect(page.getByRole("textbox").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "New river" })).toHaveCount(
      0,
    );
  });

  test("the desktop docks New river", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "phones have no dock");
    await page.goto("/");
    await appReady(page);
    await expect(
      page.getByRole("button", { name: "New river", exact: true }),
    ).toBeVisible();
  });

  test("the map button on a phone is a magnifier", async ({ page }, info) => {
    test.skip(info.project.name === "desktop", "phones only");
    await page.goto("/");
    await appReady(page);
    const fab = page.getByRole("button", { name: "Open search panel" });
    await expect(fab).toBeVisible();
    await expect(fab.locator("svg[data-testid=SearchIcon]")).toHaveCount(1);
  });

  test("the desktop map fills the window under the bar, the panel floats over it", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "desktop", "desktop only");
    await page.goto("/");
    await appReady(page);
    const host = await box(page.getByTestId("canvas-host"));
    expect(host.x).toBe(0);
    expect(host.y).toBe(56);
    expect(host.width).toBe(1280);
    expect(Math.round(host.y + host.height)).toBe(800);
    const card = page.getByTestId("canvas-card-detail");
    expect(await computed(card, "border-top-left-radius")).toBe("16px");
    expect(await computed(card, "box-shadow")).toContain("rgba(31, 43, 49");
    const panel = await box(page.locator("[data-testid=side-panel]"));
    const b = await box(card);
    expect(b.x).toBe(16);
    expect(b.y).toBe(56 + 16);
    expect(panel.x).toBeGreaterThanOrEqual(b.x);
    expect(panel.x + panel.width).toBeLessThanOrEqual(b.x + b.width);
  });

  test("the attribution key is inset from the corner", async ({
    page,
  }, info) => {
    test.skip(info.project.name === "desktop", "phones only");
    await page.goto("/");
    await appReady(page);
    const key = page.locator(".maplibregl-ctrl-attrib").first();
    await expect(key).toBeVisible();
    const b = await box(key);
    const mapBox = await box(page.locator("canvas.maplibregl-canvas"));
    const inset = Math.min(b.x - mapBox.x, b.y - mapBox.y);
    expect(inset, "px from the nearest map edge").toBeGreaterThanOrEqual(8);
  });
});
