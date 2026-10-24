import { expect, test } from "@playwright/test";
import { appReady, computed } from "../support/fixture";

// The gap for the phone's system buttons applies only when the app runs
// installed. A browser tab has its own toolbar, so the gap is zero there.
// Chrome cannot emulate display-mode and an emulated phone reports a zero
// safe-area inset anyway, so the rule is checked in the stylesheet: the inset
// is defined only under the installed display modes.

test.skip(({ isMobile }) => !isMobile, "the system inset is the phone's");

const MODES = ["standalone", "fullscreen", "minimal-ui"];

test("the inset is zero in a tab and the safe area only when installed @small", async ({
  page,
}) => {
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
  const base = rules.filter((r) => r.media === "");
  const installed = rules.filter((r) => r.media !== "");
  expect(base.map((r) => r.text).join()).toContain("--system-inset: 0px");
  expect(base.map((r) => r.text).join()).not.toContain("env(");
  expect(installed).toHaveLength(1);
  for (const mode of MODES) {
    expect(installed[0].media).toContain(`display-mode: ${mode}`);
  }
  expect(installed[0].text).toContain("env(safe-area-inset-bottom");
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue(
        "--system-inset",
      ),
    ),
  ).toBe("0px");
});

test("the bottom nav and the pane above it take no gap in a tab", async ({
  page,
}) => {
  await page.goto("/");
  await appReady(page);
  const nav = page.getByRole("navigation", { name: "Main" });
  expect(await computed(nav, "padding-bottom")).toBe("0px");
  expect((await nav.boundingBox())?.height).toBe(64);
});
