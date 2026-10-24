import { expect, test } from "@playwright/test";
import { appReady, computed } from "../support/fixture";

// The page is never drawn under the phone's system bar, so no gap is left for
// its buttons, in a browser tab or installed. Chrome on Android reports a
// bottom safe-area inset anyway; an env() use would turn it into a dead band
// under the bottom nav. Chrome cannot emulate that inset, so the stylesheet is
// checked: no rule reads it.

test.skip(({ isMobile }) => !isMobile, "the system inset is the phone's");

test("no style reads the safe-area inset @small", async ({ page }) => {
  await page.goto("/");
  await appReady(page);
  const rules = await page.evaluate(() => {
    const out: { media: string; text: string }[] = [];
    const walk = (list: CSSRuleList, media: string) => {
      for (const r of list) {
        if (r instanceof CSSMediaRule) walk(r.cssRules, r.conditionText);
        else if (r.cssText.includes("--system-inset:"))
          out.push({ media, text: r.cssText });
      }
    };
    for (const s of document.styleSheets) {
      try {
        walk(s.cssRules, "");
      } catch {
        // a cross-origin sheet
      }
    }
    return out;
  });
  expect(rules.map((r) => r.text).join()).toContain("--system-inset: 0px");
  expect(rules.filter((r) => r.media !== "")).toHaveLength(0);
  const sheets = await page.evaluate(() =>
    [...document.styleSheets]
      .flatMap((s) => {
        try {
          return [...s.cssRules].map((r) => r.cssText);
        } catch {
          return [];
        }
      })
      .join("\n"),
  );
  expect(sheets).not.toContain("safe-area-inset-bottom");
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue(
        "--system-inset",
      ),
    ),
  ).toBe("0px");
});

test("the bottom nav takes no gap under it", async ({ page }) => {
  await page.goto("/");
  await appReady(page);
  const nav = page.getByRole("navigation", { name: "Main" });
  expect(await computed(nav, "padding-bottom")).toBe("0px");
  expect((await nav.boundingBox())?.height).toBe(64);
});
