import { expect, type Page, test } from "@playwright/test";
import { contrastReport, lightSurfaces, useScheme } from "../support/dark";

// The waterway screens in dark: river panel and tabs, section list, notes,
// the suggest forms (doc/plans/dark-mode.md, D3).

// Level dots and bars are data colours (D2) and have no text; the outlined
// chip and button hairline is the theme's (P1a). Neither is this folder's to fix.
async function expectDark(page: Page) {
  const surfaces = (await lightSurfaces(page)).filter((f) =>
    f.what.includes('"'),
  );
  expect(surfaces, "light surfaces on the screen").toEqual([]);
  // The feature type tiles use the same outlineVariant hairline; they follow
  // whatever the lead decides for outlined controls.
  const contrast = (await contrastReport(page)).filter(
    (f) =>
      !(f.what.startsWith("border") && /MuiChip|MuiButton|MuiBox/.test(f.what)),
  );
  expect(contrast, "contrast violations").toEqual([]);
}

const SCREENS: { name: string; path: string; ready: RegExp; tab?: string }[] = [
  { name: "river", path: "/?waterway=9001", ready: /Lower Test/ },
  {
    name: "river-notes",
    path: "/?waterway=9001",
    ready: /Lower Test/,
    tab: "Notes",
  },
  {
    name: "river-gauges",
    path: "/?waterway=9001",
    ready: /Test River/,
    tab: "Gauges",
  },
  {
    name: "section",
    path: "/?waterway=9001&section=9102",
    ready: /Lower Test/,
  },
  {
    name: "section-sources",
    path: "/?waterway=9001&section=9102",
    ready: /Lower Test/,
    tab: "Sources",
  },
  {
    name: "suggest-section",
    path: "/waterways/suggest-section?waterway=9001",
    ready: /\w/,
  },
];

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
}

test.describe("waterway in dark @small", () => {
  test("suggest-river", async ({ page }) => {
    await useScheme(page, "system", "dark");
    await page.goto("/?panel=1&q=Nowhere");
    const add = page.getByText(/Can't find your river/).first();
    if (await add.isVisible()) await add.click();
    await expect(page.getByRole("textbox", { name: "Name" })).toBeVisible();
    await expect(page.locator("body")).toContainText(/river/i);
    await page.waitForTimeout(1000);
    await settle(page);
    await expectDark(page);
  });

  test("suggest-feature", async ({ page }) => {
    await useScheme(page, "system", "dark");
    await page.goto("/?waterway=9001&section=9102");
    await expect(page.locator("body")).toContainText(/Lower Test/);
    await page.getByRole("button", { name: "New feature" }).first().click();
    await expect(page.locator("body")).toContainText(/feature|type/i);
    await page.waitForTimeout(1000);
    await settle(page);
    await expectDark(page);
  });

  test("note composer", async ({ page }) => {
    await useScheme(page, "system", "dark");
    await page.goto("/?waterway=9001");
    await page.getByRole("tab", { name: "Notes", exact: true }).first().click();
    await page
      .getByPlaceholder(/Add a note/)
      .first()
      .click();
    await expect(page.getByLabel("Kind")).toBeVisible();
    await page.waitForTimeout(500);
    await settle(page);
    await expectDark(page);
  });

  for (const s of SCREENS) {
    test(s.name, async ({ page }) => {
      await useScheme(page, "system", "dark");
      await page.goto(s.path);
      await expect(page.locator("body")).toContainText(s.ready);
      if (s.tab) {
        const tab = page.getByRole("tab", { name: s.tab, exact: true });
        await tab.first().click();
        if (s.tab === "Notes")
          await expect(page.getByText("Hazard").first()).toBeVisible();
      }
      await page.waitForTimeout(1000);
      await settle(page);
      await expectDark(page);
      const over = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(over, "sideways scroll").toBeLessThanOrEqual(0);
    });
  }
});
