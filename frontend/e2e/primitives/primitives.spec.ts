import { expect, type Locator, type Page, test } from "@playwright/test";
import { Finger } from "../support/finger";
import {
  computed,
  expectNoHorizontalOverflow,
  expectTouchTargets,
  gotoSection,
  phoneOnly,
} from "../support/fixture";

// The shared primitives of the UI overhaul, held to what the browser computes.
// The section screen's tabs (Features, Logs, Notes) are the one place the tab
// bar and the swipe are wired, so they are the end-to-end subject here.

test.use({ hasTouch: true });

const TEAL = "rgb(14, 116, 144)";

const tab = (page: Page, name: string) =>
  page.getByRole("tab", { name, exact: true });

/** Starts timing at the next pointer release and resolves with the ms until
 * the Logs tab is selected and its pane rests at full opacity. Call it before
 * the release and await it after. */
function timeSettle(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        addEventListener(
          "pointerup",
          () => {
            const t0 = performance.now();
            const tick = () => {
              const logs =
                document.querySelector("[role=tab][aria-selected=true]")
                  ?.textContent === "Logs";
              const pane = [
                ...document.querySelectorAll<HTMLElement>(
                  "[data-testid=tab-pane]",
                ),
              ].find((el) => el.offsetParent !== null);
              const cs = pane && getComputedStyle(pane);
              if (logs && cs?.opacity === "1" && cs.transform === "none") {
                resolve(performance.now() - t0);
              } else {
                requestAnimationFrame(tick);
              }
            };
            tick();
          },
          { capture: true, once: true },
        );
      }),
  );
}

/** The pane's horizontal translation in px, from its computed matrix. */
async function paneX(pane: Locator) {
  return pane.evaluate((el) => {
    const t = getComputedStyle(el).transform;
    return t === "none" ? 0 : new DOMMatrixReadOnly(t).m41;
  });
}

async function openSection(page: Page) {
  await gotoSection(page, "lower");
  await expect(tab(page, "Features")).toBeVisible();
  const pane = page.locator("[data-testid=tab-pane]:visible");
  await expect(pane).toBeVisible();
  const box = await pane.boundingBox();
  if (!box) throw new Error("no pane box");
  return { pane, box };
}

test.describe("underlined tabs", () => {
  test("@small the section tabs are MUI tabs, 48px, sentence case, teal when selected", async ({
    page,
  }) => {
    await openSection(page);
    const tabs = page.locator("button.MuiTab-root:visible");
    await expect(tabs).toHaveCount(4);
    const heights = await tabs.evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect().height),
    );
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(48);
    for (let i = 0; i < 4; i++) {
      expect(await computed(tabs.nth(i), "text-transform")).toBe("none");
    }
    await expect(tab(page, "Features")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await computed(tab(page, "Features"), "color")).toBe(TEAL);
    expect(await computed(tab(page, "Logs"), "color")).not.toBe(TEAL);

    const indicator = page.locator(".MuiTabs-indicator:visible");
    await expect(indicator).toBeVisible();
    expect(await computed(indicator, "background-color")).toBe(TEAL);
    expect(await computed(indicator, "height")).toBe("3px");
  });

  test("@small tabs keep their roles and the arrow keys", async ({ page }) => {
    await openSection(page);
    await expect(page.getByRole("tablist")).toBeVisible();
    await tab(page, "Features").focus();
    await page.keyboard.press("ArrowRight");
    await expect(tab(page, "Logs")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(tab(page, "Logs")).toHaveAttribute("aria-selected", "true");
  });

  test("@small the back arrow is a touch target", async ({ page }) => {
    await openSection(page);
    await expectTouchTargets(
      page.getByRole("button", { name: "Back" }).filter({ visible: true }),
      44,
    );
  });

  test("@small the screen does not scroll sideways", async ({ page }) => {
    await openSection(page);
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page.locator("button.MuiTab-root:visible"), 44);
  });
});

test.describe("swipeable tabs", () => {
  phoneOnly("touch swipes; the phone project covers them");

  test("a swipe past 40% moves Features to Logs", async ({ page }) => {
    const { pane, box } = await openSection(page);
    const f = await Finger.down(
      page,
      box.x + box.width * 0.8,
      box.y + box.height / 2,
    );
    await f.moveBy(-box.width * 0.55);
    await f.up();
    await expect(tab(page, "Logs")).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => paneX(pane)).toBe(0);
  });

  test("the content follows the finger one to one", async ({ page }) => {
    const { pane, box } = await openSection(page);
    const f = await Finger.down(
      page,
      box.x + box.width * 0.8,
      box.y + box.height / 2,
    );
    await f.moveBy(-box.width * 0.3);
    const x = await paneX(pane);
    expect(x).toBeLessThan(-box.width * 0.3 + 12);
    expect(x).toBeGreaterThan(-box.width * 0.3 - 2);
    await f.up();
  });

  test("a swipe below 40% springs back", async ({ page }) => {
    const { pane, box } = await openSection(page);
    const f = await Finger.down(
      page,
      box.x + box.width * 0.8,
      box.y + box.height / 2,
    );
    await f.moveBy(-box.width * 0.25);
    await f.up();
    await expect.poll(() => paneX(pane)).toBe(0);
    await expect(tab(page, "Features")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("a steep drag scrolls instead of swiping", async ({ page }) => {
    const { pane, box } = await openSection(page);
    const f = await Finger.down(
      page,
      box.x + box.width * 0.8,
      box.y + box.height / 2,
    );
    await f.moveBy(-box.width * 0.2, 150);
    expect(await paneX(pane)).toBe(0);
    await f.up();
    await expect(tab(page, "Features")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("the first tab resists a swipe to the right", async ({ page }) => {
    const { pane, box } = await openSection(page);
    const f = await Finger.down(
      page,
      box.x + box.width * 0.3,
      box.y + box.height / 2,
    );
    await f.moveBy(box.width * 0.5);
    const x = await paneX(pane);
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThanOrEqual(24);
    await f.up();
    await expect.poll(() => paneX(pane)).toBe(0);
    await expect(tab(page, "Features")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("the first 24px at the screen edge are left alone", async ({ page }) => {
    const { pane, box } = await openSection(page);
    const f = await Finger.down(page, 10, box.y + box.height / 2);
    await f.moveBy(box.width * 0.5);
    expect(await paneX(pane)).toBe(0);
    await f.up();
    await expect(tab(page, "Features")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("a swipe that starts on the tab bar works", async ({ page }) => {
    const { pane, box } = await openSection(page);
    const bar = await page.locator(".MuiTabs-root:visible").boundingBox();
    if (!bar) throw new Error("no tab bar box");
    const f = await Finger.down(
      page,
      bar.x + bar.width * 0.8,
      bar.y + bar.height / 2,
    );
    await f.moveBy(-box.width * 0.55);
    await f.up();
    await expect(tab(page, "Logs")).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => paneX(pane)).toBe(0);
  });

  test("a committed swipe settles inside the slow ceiling", async ({
    page,
  }) => {
    const { box } = await openSection(page);
    const settled = timeSettle(page);
    const f = await Finger.down(
      page,
      box.x + box.width * 0.8,
      box.y + box.height / 2,
    );
    await f.moveBy(-box.width * 0.55);
    await f.up();
    const ms = await settled;
    // 360ms is `tokens.motion.slow`; the margin is the harness, not the app.
    expect(ms, "release to a settled new pane, ms").toBeLessThan(360 + 30);
    expect(ms).toBeGreaterThan(0);
  });

  test("under reduced motion the pane cross-fades in about 140ms", async ({
    page,
  }) => {
    // The device setting counts only when the app follows the system.
    await page.addInitScript(() => localStorage.setItem("pm-motion", "system"));
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { pane, box } = await openSection(page);
    const settled = timeSettle(page);
    const f = await Finger.down(
      page,
      box.x + box.width * 0.8,
      box.y + box.height / 2,
    );
    await f.moveBy(-box.width * 0.55);
    // Nothing slides: the pane stays where the finger left it until the fade.
    await f.up();
    const ms = await settled;
    expect(ms, "release to a settled new pane, ms").toBeGreaterThan(100);
    // The fade is 140ms; rendering the new tab on a slow desktop adds to it.
    expect(ms).toBeLessThan(360);
    await expect(tab(page, "Logs")).toHaveAttribute("aria-selected", "true");
    expect(await paneX(pane)).toBe(0);
  });
});
