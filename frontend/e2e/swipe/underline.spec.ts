import { expect, test } from "@playwright/test";
import { Finger } from "../support/finger";

// After a committed swipe the underline goes from the old tab to the new one
// and stays there; it never shows under the old tab again on the way.

test.use({ hasTouch: true });

const screens = [
  {
    name: "section",
    path: "/?waterway=9001&section=9101",
    from: "Features",
    pane: "[data-testid=tab-pane]:visible",
  },
  {
    name: "trip",
    path: "/trips/9001",
    from: "Plan",
    pane: "[data-testid=trip-pane]",
  },
  {
    name: "proposals",
    path: "/proposals",
    from: "Pending",
    pane: "[data-testid=proposals-pane]",
  },
  {
    name: "profile",
    path: "/settings",
    from: "Profile",
    pane: "[data-testid=settings-pane]",
  },
];

for (const s of screens) {
  test(`${s.name} tabs: the underline does not jump back`, async ({
    page,
  }, info) => {
    test.skip(info.project.name.startsWith("desktop"), "touch layouts only");
    await page.goto(s.path);
    const from = page.getByRole("tab", { name: s.from });
    await expect(from).toHaveAttribute("aria-selected", "true");
    const fromLeft = (await from.boundingBox())?.x ?? 0;

    const pane = page.locator(s.pane).first();
    const box = await pane.boundingBox();
    if (!box) throw new Error("no tab pane");
    const f = await Finger.down(
      page,
      box.x + box.width * 0.8,
      box.y + Math.min(box.height / 2, 120),
    );
    await f.moveBy(-box.width * 0.5);

    // Every frame from the release on: where the visible underline starts.
    await page.evaluate(() => {
      const w = window as unknown as { underline: number[] };
      w.underline = [];
      const start = performance.now();
      const sample = () => {
        const lines = [
          ...document.querySelectorAll<HTMLElement>(
            ".MuiTabs-indicator, [data-swiping] > span",
          ),
        ].filter((el) => {
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return (
            cs.display !== "none" &&
            cs.visibility !== "hidden" &&
            r.width > 0 &&
            r.bottom > 0
          );
        });
        for (const el of lines) {
          w.underline.push(el.getBoundingClientRect().left);
        }
        if (performance.now() - start < 1000) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await f.up();
    await page.waitForTimeout(1100);

    const to = page.getByRole("tab", { selected: true });
    await expect(to).not.toHaveText(s.from);
    const toLeft = (await to.boundingBox())?.x ?? 0;
    const lefts = await page.evaluate(
      () => (window as unknown as { underline: number[] }).underline,
    );
    expect(lefts.length, "underline sampled").toBeGreaterThan(5);
    // From the release on the line only moves toward the new tab.
    const dir = Math.sign(toLeft - fromLeft);
    const back = lefts.filter((x, i) => i > 0 && (x - lefts[i - 1]) * dir < -1);
    expect(back, "underline moved back toward the old tab").toEqual([]);
    expect(Math.abs(lefts[lefts.length - 1] - toLeft)).toBeLessThan(2);
  });
}
