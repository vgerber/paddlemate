import { expect, test } from "@playwright/test";
import { SCREENS, useScheme } from "../support/dark";

// Light mode must not change when dark mode lands. These screenshots were
// taken on the branch before any dark-mode change (`__baseline__/`, deleted
// with doc/plans/dark-mode.md). Rewrite them with `--update-snapshots` only
// when light mode is meant to change.
//
// Tolerance. The dark-mode spike measured colour mixing rounding a few
// hairline pixels by up to 7/255 against the old hex-alpha suffix: a pixel
// counts as different above `threshold` (YIQ distance; 0.05 is about 8/255
// on grey). Text edges re-rasterise by a pixel between runs of the same
// build (measured: up to 0.75% of a phone screen, 0.45% of a desktop one),
// so the screen may hold 1.5% different pixels. A layout shift or a changed
// surface colour over a card is far above that. A transient loading frame
// is retried.
const THRESHOLD = 0.05;
const MAX_DIFF_RATIO = 0.015;

test.describe.configure({ retries: 3 });

test.describe("light baseline @small", () => {
  for (const screen of SCREENS) {
    test(screen.name, async ({ page }, info) => {
      await useScheme(page, "light");
      await page.goto(screen.path);
      await screen.ready(page);
      await screen.open?.(page);
      // The face downloads per unicode-range once text is laid out, after
      // the first `fonts.ready`, and `check` without text tests only a
      // space: ask about the page's own text, and wait for the loader.
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.fonts.status === "loaded" &&
              document.fonts.check(
                '500 16px "Figtree Variable"',
                document.body.innerText.slice(0, 400),
              ),
          ),
        )
        .toBe(true);
      await expect(page).toHaveScreenshot(
        `${screen.name}-${info.project.name}.png`,
        {
          stylePath: "e2e/dark/baseline.css",
          // Clock-bound text: "1m ago" and the reading time.
          mask: [
            page.getByText(/\bago\b|\b\d\d:\d\d\b/),
            ...(screen.volatile ? [page.locator(screen.volatile)] : []),
          ],
          animations: "disabled",
          caret: "hide",
          threshold: THRESHOLD,
          maxDiffPixelRatio: MAX_DIFF_RATIO,
        },
      );
    });
  }
});
