import { expect, test } from "@playwright/test";
import { useScheme } from "../support/dark";
import {
  axeViolations,
  clippedText,
  openScreen,
  overflowX,
  report,
  SWEEP_SCREENS,
  smallTargets,
  tabThrough,
} from "../support/sweep";

// WP15 S0: one pass over every screen for what a small phone, big text, a
// keyboard and a screen reader need (doc/plans/sweep.md). Every check is soft,
// so one run lists all failures; they also go to sweep-results/<project>.jsonl.
// Run a single screen with `-g "sweep: <name>"`. Checks tagged @small run on
// the 320px project too.

test.setTimeout(120_000);
test.use({ screenshot: "off", trace: "off" });

for (const screen of SWEEP_SCREENS) {
  test.describe(`sweep: ${screen.name}`, () => {
    test("layout at the project width @small", async ({ page }, info) => {
      await useScheme(page, "light");
      await openScreen(page, screen);
      report(info, screen.name, "overflow", await overflowX(page));
      report(info, screen.name, "clipped text", await clippedText(page));
    });

    test("layout at 390px with 130% text", async ({ page }, info) => {
      test.skip(!info.project.name.startsWith("phone"), "a phone check");
      await useScheme(page, "light");
      await page.setViewportSize({ width: 390, height: 844 });
      await page.addInitScript(() => {
        document.addEventListener("DOMContentLoaded", () => {
          document.documentElement.style.fontSize = "130%";
        });
      });
      await openScreen(page, screen);
      const px = await page.evaluate(
        () => getComputedStyle(document.documentElement).fontSize,
      );
      expect(px, "root font size at 130%").toBe("20.8px");
      report(info, screen.name, "overflow 130%", await overflowX(page));
      report(info, screen.name, "clipped text 130%", await clippedText(page));
    });

    test("touch targets @small", async ({ page }, info) => {
      await useScheme(page, "light");
      await openScreen(page, screen);
      report(info, screen.name, "touch target", await smallTargets(page));
    });

    for (const scheme of ["light", "dark"] as const) {
      test(`axe, ${scheme}`, async ({ page }, info) => {
        await useScheme(page, scheme);
        await openScreen(page, screen);
        report(info, screen.name, `axe ${scheme}`, await axeViolations(page));
      });
    }

    test("keyboard: Tab order and focus", async ({ page }, info) => {
      await useScheme(page, "light");
      await openScreen(page, screen);
      report(info, screen.name, "keyboard", await tabThrough(page));
    });

    test("keyboard: Escape closes what opened", async ({ page }) => {
      test.skip(!screen.overlay, "nothing opens over this screen");
      await useScheme(page, "light");
      await openScreen(page, screen);
      const overlay = screen.overlay?.(page);
      if (!overlay) return;
      await expect(overlay.first()).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(overlay, "still open after Escape").toHaveCount(0, {
        timeout: 3000,
      });
    });
  });
}
