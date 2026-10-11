import { expect, test } from "@playwright/test";
import {
  appReady,
  computed,
  expectNoHorizontalOverflow,
  gotoSection,
} from "../support/fixture";

// The theme is the first work package of the UI overhaul. These checks hold
// the tokens in doc/design.md to what the browser actually computes, so a
// later change that drifts from the calm design fails here first.

test.describe("theme tokens", () => {
  test("the ground and the ink are the calm tokens", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    expect(await computed(page.locator("body"), "background-color")).toBe(
      "rgb(238, 242, 243)",
    );
    expect(await computed(page.locator("body"), "color")).toBe(
      "rgb(31, 43, 49)",
    );
  });

  test("one typeface, loaded: Figtree", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    expect(await computed(page.locator("body"), "font-family")).toContain(
      "Figtree",
    );
    const loaded = await page.evaluate(() =>
      document.fonts.check('600 16px "Figtree Variable"'),
    );
    expect(loaded, "Figtree Variable is loaded").toBe(true);
  });

  test("buttons, tabs and toggles are sentence case, not capitals", async ({
    page,
  }) => {
    await gotoSection(page, "lower");
    const controls = page.locator(
      "button.MuiButton-root:visible, button.MuiTab-root:visible, button.MuiToggleButton-root:visible",
    );
    await expect(controls.first()).toBeVisible();
    const count = await controls.count();
    for (let i = 0; i < count; i++) {
      expect(await computed(controls.nth(i), "text-transform")).toBe("none");
    }
  });

  test("the accent is teal: the primary action and the selected tab", async ({
    page,
  }) => {
    await page.goto("/trips");
    const action = page.locator(
      "button.MuiFab-root:visible, button.MuiButton-contained:visible",
    );
    await expect(action.first()).toBeVisible();
    expect(await computed(action, "background-color")).toBe(
      "rgb(14, 116, 144)",
    );

    // The selected tab (phone) and the selected list row (desktop, a white
    // card with a teal ring) are drawn from palette.primary, a different
    // token from the action above, so each guards its own value.
    await page.goto("/settings");
    const tab = page.locator(".MuiTabs-indicator:visible");
    if (await tab.count()) {
      expect(await computed(tab, "background-color")).toBe("rgb(14, 116, 144)");
    } else {
      const row = page.locator(".MuiListItemButton-root.Mui-selected:visible");
      await expect(row.first()).toBeVisible();
      expect(await computed(row, "box-shadow")).toContain("rgb(14, 116, 144)");
    }
  });

  test("secondary text computes to ink2 on two screens", async ({ page }) => {
    await page.goto("/tools");
    const tool = page.getByText(
      "Review and submit river and section proposals",
    );
    await expect(tool.first()).toBeVisible();
    expect(await computed(tool, "color")).toBe("rgb(88, 102, 109)");

    await page.goto("/settings");
    const hint = page.getByTestId("settings-list").locator("p").nth(1);
    await expect(hint).toBeVisible();
    expect(await computed(hint, "color")).toBe("rgb(88, 102, 109)");
  });

  test("reduced motion collapses transitions", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const target = page.locator("button:visible").first();
    await expect(target).toBeVisible();
    const duration = await computed(target, "transition-duration");
    const longest = Math.max(
      ...duration.split(",").map((d) => Number.parseFloat(d)),
    );
    expect(longest, "longest transition in seconds").toBeLessThanOrEqual(0.001);
  });
});

test.describe("layout floor", () => {
  test("the start screen never scrolls sideways @small", async ({ page }) => {
    await page.goto("/");
    await appReady(page);
    await expectNoHorizontalOverflow(page);
  });

  test("a section screen never scrolls sideways @small", async ({ page }) => {
    await gotoSection(page, "lower");
    await expectNoHorizontalOverflow(page);
  });
});

test("screens for review", async ({ page }, testInfo) => {
  await gotoSection(page, "lower");
  await testInfo.attach("section", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
});
