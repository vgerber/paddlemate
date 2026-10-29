import { devices, expect, test } from "@playwright/test";
import { appReady, computed } from "../support/fixture";

// Android and desktops never draw the page under the system bar, so no gap is
// left for its buttons: Chrome on Android reports a bottom safe-area inset
// anyway, and reading it left a dead band under the bottom nav. iOS does draw
// an installed app under the home indicator, so there (and only there) the
// page is drawn to the edge and the bottom chrome keeps the safe area clear.
// Chrome cannot emulate the inset itself, so the rule is checked in the
// stylesheet and the page's flags.

test.skip(({ isMobile }) => !isMobile, "the system inset is the phone's");

const insetRule = (selector: string) =>
  `(() => {
    for (const s of document.styleSheets) {
      let rules;
      try { rules = s.cssRules; } catch { continue; }
      for (const r of rules) {
        if (r instanceof CSSStyleRule && r.selectorText === ${JSON.stringify(selector)})
          return r.style.getPropertyValue("--system-inset").trim();
      }
    }
    return null;
  })()`;

test("Android draws no gap under the bottom nav @small", async ({ page }) => {
  const ua = await page.evaluate(() => navigator.userAgent);
  test.skip(/iPhone|iPad|iPod/.test(ua), "an iPhone layout: the iOS test");
  await page.goto("/");
  await appReady(page);
  expect(
    await page.evaluate(() =>
      document.documentElement.hasAttribute("data-ios"),
    ),
  ).toBe(false);
  expect(
    await page.locator('meta[name="viewport"]').getAttribute("content"),
  ).not.toContain("viewport-fit=cover");
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue(
        "--system-inset",
      ),
    ),
  ).toBe("0px");
  const nav = page.getByRole("navigation", { name: "Main" });
  expect(await computed(nav, "padding-bottom")).toBe("0px");
  expect((await nav.boundingBox())?.height).toBe(64);
});

test("iOS draws to the edge and keeps the home indicator clear", async ({
  browser,
}) => {
  const iphone = devices["iPhone 13"];
  const context = await browser.newContext({
    userAgent: iphone.userAgent,
    viewport: iphone.viewport,
    isMobile: true,
    hasTouch: true,
    storageState: "e2e/.auth/vincent.json",
  });
  const page = await context.newPage();
  await page.goto("/");
  await appReady(page);
  expect(
    await page.evaluate(() =>
      document.documentElement.hasAttribute("data-ios"),
    ),
  ).toBe(true);
  expect(
    await page.locator('meta[name="viewport"]').getAttribute("content"),
  ).toContain("viewport-fit=cover");
  expect(await page.evaluate(insetRule(":root[data-ios]"))).toBe(
    "env(safe-area-inset-bottom, 0px)",
  );
  await context.close();
});
