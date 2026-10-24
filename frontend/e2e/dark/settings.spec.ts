import { expect, type Page, test } from "@playwright/test";
import { MODE_KEY } from "../support/dark";
import {
  expectNoHorizontalOverflow,
  expectTouchTargets,
} from "../support/fixture";

const OPEN = "/settings?group=appearance";
const LIGHT_FRAME = "#ffffff";
const DARK_FRAME = "#141b1f";

const scheme = (page: Page) =>
  page.evaluate(() => document.documentElement.getAttribute("data-theme"));
const stored = (page: Page) =>
  page.evaluate((k) => localStorage.getItem(k), MODE_KEY);
const choice = (page: Page, name: string) =>
  page
    .getByTestId("settings-detail")
    .getByRole("button", { name, exact: true });
const frames = (page: Page) =>
  page.evaluate(() => ({
    light: document
      .querySelector('meta[name="theme-color"][media*="light"]')
      ?.getAttribute("content"),
    dark: document
      .querySelector('meta[name="theme-color"][media*="dark"]')
      ?.getAttribute("content"),
  }));
const bodyBg = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

async function open(page: Page, os: "light" | "dark") {
  await page.emulateMedia({ colorScheme: os });
  await page.goto(OPEN);
  await expect(choice(page, "System")).toBeVisible();
}

test.describe("appearance setting @small", () => {
  test("is a row in the settings list that opens it", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/settings");
    await page
      .getByTestId("settings-list")
      .getByRole("button", { name: "Appearance" })
      .click();
    await expect(page).toHaveURL(/group=appearance/);
    await expect(choice(page, "Dark")).toBeVisible();
  });

  test("System is the default and follows the device", async ({ page }) => {
    await open(page, "light");
    await expect(choice(page, "System")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(await scheme(page)).toBe("light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => scheme(page)).toBe("dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(() => scheme(page)).toBe("light");
  });

  test("Dark and Light apply without a reload and keep the marker", async ({
    page,
  }) => {
    await open(page, "light");
    await page.evaluate(() => {
      (window as unknown as { __marker: number }).__marker = 7;
    });
    const before = await bodyBg(page);
    await choice(page, "Dark").click();
    await expect.poll(() => scheme(page)).toBe("dark");
    await expect(choice(page, "Dark")).toHaveAttribute("aria-pressed", "true");
    expect(await bodyBg(page)).not.toBe(before);
    await choice(page, "Light").click();
    await expect.poll(() => scheme(page)).toBe("light");
    expect(await bodyBg(page)).toBe(before);
    expect(
      await page.evaluate(
        () => (window as unknown as { __marker: number }).__marker,
      ),
    ).toBe(7);
  });

  test("the choice survives a reload, with no flash", async ({ page }) => {
    await open(page, "light");
    await choice(page, "Dark").click();
    await expect.poll(() => stored(page)).toBe("dark");
    await page.reload();
    // Before the bundle runs the inline script has already set the scheme.
    expect(await scheme(page)).toBe("dark");
    await expect(choice(page, "Dark")).toHaveAttribute("aria-pressed", "true");
    await choice(page, "System").click();
    await expect.poll(() => scheme(page)).toBe("light");
    await page.reload();
    await expect(choice(page, "System")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("the frame meta follows the scheme and keeps a dark device dark", async ({
    page,
  }) => {
    await open(page, "light");
    expect(await frames(page)).toEqual({
      light: LIGHT_FRAME,
      dark: DARK_FRAME,
    });
    await choice(page, "Dark").click();
    await expect
      .poll(() => frames(page))
      .toEqual({
        light: DARK_FRAME,
        dark: DARK_FRAME,
      });
    await choice(page, "Light").click();
    await expect
      .poll(() => frames(page))
      .toEqual({
        light: LIGHT_FRAME,
        dark: DARK_FRAME,
      });

    // A dark device with the app forced Light: the dark frame stays.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    await expect(choice(page, "Light")).toHaveAttribute("aria-pressed", "true");
    expect(await scheme(page)).toBe("light");
    expect((await frames(page)).dark).toBe(DARK_FRAME);
    // System on a dark device is dark everywhere.
    await choice(page, "System").click();
    await expect.poll(() => scheme(page)).toBe("dark");
    expect(await frames(page)).toEqual({ light: DARK_FRAME, dark: DARK_FRAME });
    await choice(page, "System").click();
  });

  test("works by keyboard", async ({ page }) => {
    await open(page, "light");
    await choice(page, "System").focus();
    await page.keyboard.press("Tab");
    await expect(choice(page, "Light")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(choice(page, "Dark")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect.poll(() => scheme(page)).toBe("dark");
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Space");
    await expect.poll(() => scheme(page)).toBe("light");
    await choice(page, "System").click();
  });

  test("targets are 44px and nothing scrolls sideways", async ({ page }) => {
    await open(page, "light");
    await expectTouchTargets(
      page.getByTestId("settings-detail").locator("button[aria-pressed]"),
    );
    await expectNoHorizontalOverflow(page);
  });
});
