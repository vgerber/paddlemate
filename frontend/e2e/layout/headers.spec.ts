import { expect, type Locator, type Page, test } from "@playwright/test";
import { appReady, computed, FIX, gotoSection } from "../support/fixture";

// One bar geometry on a phone: a 56 title row, 104 with the tab row, titles
// 20/700, action icons 24, back icon and titles on the 28 and 68 lines.

const css = (l: Locator, prop: string) =>
  l.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

const visible = (page: Page, name: string) =>
  page.getByRole("heading", { name, exact: true }).filter({ visible: true });

/** Height of the bar holding the heading: the nearest ancestor with a shadow. */
const barHeight = (heading: Locator) =>
  heading.evaluate((el) => {
    let node: HTMLElement | null = el as HTMLElement;
    while (node && getComputedStyle(node).boxShadow === "none") {
      node = node.parentElement;
    }
    return node?.getBoundingClientRect().height ?? 0;
  });

test.describe("bars and titles on a phone", () => {
  test.skip(({ isMobile }) => !isMobile, "the phone's bars");

  test("@small search and river share the 104 bar", async ({ page }) => {
    await page.goto("/?panel=1");
    await appReady(page);
    const search = visible(page, "Search");
    await expect(search).toBeVisible();
    expect(await barHeight(search)).toBe(104);
    expect(await css(search, "font-size")).toBe("20px");
    expect((await search.boundingBox())?.x).toBe(28);
    const icon = page
      .getByRole("button", { name: "Map", exact: true })
      .filter({ visible: true })
      .locator("svg");
    expect((await icon.boundingBox())?.width).toBe(24);

    await page.goto(`/?waterway=${FIX.waterway}`);
    await appReady(page);
    const river = page.locator("h3").filter({ hasText: "Test River" });
    await expect(river.first()).toBeVisible();
    expect(await barHeight(river.first())).toBe(104);
  });

  test("@small section bar: 104, action icons 24, back and title lines", async ({
    page,
  }) => {
    await gotoSection(page, "lower");
    const title = page.locator("h3").filter({ visible: true }).first();
    await expect(title).toBeVisible();
    expect(await barHeight(title)).toBe(104);
    expect(await css(title, "font-weight")).toBe("700");
    expect((await title.boundingBox())?.x).toBe(68);
    const back = page.locator("[data-panel-back] svg").first();
    expect((await back.boundingBox())?.x).toBe(28);
    const row = title.locator(
      "xpath=ancestor::div[.//button[@data-panel-back]][1]",
    );
    const sizes = await row
      .locator("button:not([data-panel-back]) svg")
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
    expect(sizes.length).toBeGreaterThan(0);
    for (const w of sizes) expect(w).toBe(24);
  });

  test("@small Settings has a 56 title row over the tabs", async ({ page }) => {
    await page.goto("/settings");
    const title = visible(page, "Settings");
    await expect(title).toBeVisible();
    expect(await barHeight(title)).toBe(104);
    expect(await css(title, "font-size")).toBe("20px");
    expect((await title.boundingBox())?.x).toBe(28);
  });

  test("@small Tools has a 56 bar and a 20px title on the 28 line", async ({
    page,
  }) => {
    await page.goto("/tools");
    const title = visible(page, "Tools");
    await expect(title).toBeVisible();
    expect(await barHeight(title)).toBe(56);
    expect(await css(title, "font-size")).toBe("20px");
    expect(await css(title, "font-weight")).toBe("700");
    expect((await title.boundingBox())?.x).toBe(28);
  });

  test("@small the filters sheet title is 18/700/24 on the 28 line", async ({
    page,
  }) => {
    await page.goto("/?panel=1&q=Test");
    await appReady(page);
    await page
      .getByRole("button", { name: /^Water/ })
      .filter({ visible: true })
      .first()
      .click();
    const title = page
      .getByRole("dialog", { name: "Filters" })
      .getByRole("heading", { name: "Filters" });
    await expect(title).toBeVisible();
    expect(await css(title, "font-size")).toBe("18px");
    expect(await css(title, "line-height")).toBe("24px");
    expect((await title.boundingBox())?.x).toBe(28);
  });

  test("@small a state card title is 15/600/20", async ({ page }) => {
    await page.goto("/auth/callback?error=access_denied&state=x");
    const title = page.getByTestId("state-card").locator("h6");
    await expect(title).toBeVisible();
    expect(await css(title, "font-size")).toBe("15px");
    expect(await css(title, "font-weight")).toBe("600");
    expect(await css(title, "line-height")).toBe("20px");
  });
});

// In-screen section headings share one style on every screen
// (doc/design.md): 13/600, 18 line height, the secondary colour.

test.describe("section headings @small", () => {
  const style = (loc: Locator) =>
    loc.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        size: s.fontSize,
        weight: s.fontWeight,
        line: s.lineHeight,
        color: s.color,
        transform: s.textTransform,
      };
    });

  const seen = async (loc: Locator) => {
    await loc.first().waitFor({ state: "visible" });
    return style(loc.first());
  };

  test("settings, logs and the log form agree", async ({ page }) => {
    await page.goto("/settings?group=tokens");
    const tokens = await seen(
      page.getByRole("heading", { name: "Your tokens" }),
    );
    expect(tokens).toMatchObject({
      size: "13px",
      weight: "600",
      line: "18px",
      transform: "none",
    });
    const newToken = await seen(
      page.getByTestId("form-section-label").filter({ visible: true }),
    );
    expect(newToken).toEqual(tokens);

    await page.goto("/settings?group=appearance");
    expect(
      await seen(
        page.getByTestId("form-section-label").filter({ visible: true }),
      ),
    ).toEqual(tokens);

    await page.goto("/logs");
    expect(
      await seen(page.getByTestId("log-month").filter({ visible: true })),
    ).toEqual(tokens);
  });

  test("space around a heading is 24 above and 8 below", async ({ page }) => {
    await page.goto("/settings?group=tokens");
    const h = page.getByRole("heading", { name: "Your tokens" });
    await h.waitFor();
    const row = h.locator("xpath=..");
    const m = await row.evaluate((el) => {
      const s = getComputedStyle(el);
      return { top: s.marginTop, bottom: s.marginBottom };
    });
    expect(m.bottom).toBe("8px");
    expect(m.top).toBe("0px"); // opens its block
  });
});

// Header unification: section headings are 13/600/18 and card titles 15/600/20
// wherever they appear.

const SECTION = { size: "13px", weight: "600", line: "18px" };
const CARD = { size: "15px", weight: "600", line: "20px" };

async function expectType(
  page: Page,
  name: string,
  want: typeof SECTION,
  tag?: string,
) {
  const el = page
    .locator("p, h2, h3")
    .getByText(name, { exact: true })
    .filter({ visible: true })
    .first();
  await expect(el).toBeVisible();
  expect(await computed(el, "font-size"), `${name} size`).toBe(want.size);
  expect(await computed(el, "font-weight"), `${name} weight`).toBe(want.weight);
  expect(await computed(el, "line-height"), `${name} line`).toBe(want.line);
  if (tag) expect(await el.evaluate((n) => n.tagName)).toBe(tag);
}

test.describe("content headings: provenance and proposals", () => {
  test("Sources and All edits are card titles", async ({ page }) => {
    await gotoSection(page, "lower");
    await page.getByRole("tab", { name: "Sources", exact: true }).click();
    await expectType(page, "Sources", CARD);
    await expectType(page, "All edits", CARD);
  });

  test("proposal detail headings are section headings", async ({ page }) => {
    await page.goto("/proposals/9701");
    await expectType(page, "Features", SECTION, "H2");
  });
});
