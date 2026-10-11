import {
  type CDPSession,
  expect,
  type Locator,
  type Page,
  test,
} from "@playwright/test";
import {
  computed,
  expectNoHorizontalOverflow,
  expectTouchTargets,
  gotoSection,
} from "../support/fixture";

// The shared primitives of the UI overhaul, held to what the browser computes.
// The section screen's tabs (Features, Logs, Notes) are the one place the tab
// bar and the swipe are wired, so they are the end-to-end subject here.

test.use({ hasTouch: true });

const TEAL = "rgb(14, 116, 144)";

const tab = (page: Page, name: string) =>
  page.getByRole("tab", { name, exact: true });

/** One finger driven through the devtools protocol. Steps are spaced so the
 * release speed stays near zero: a slow drag, never a flick. */
class Finger {
  private constructor(
    private cdp: CDPSession,
    private x: number,
    private y: number,
  ) {}

  static async down(page: Page, x: number, y: number) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    return new Finger(cdp, x, y);
  }

  async moveBy(dx: number, dy = 0, steps = 10, stepMs = 25) {
    for (let i = 1; i <= steps; i++) {
      await this.cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: this.x + (dx * i) / steps, y: this.y + (dy * i) / steps },
        ],
      });
      await new Promise((r) => setTimeout(r, stepMs));
    }
    this.x += dx;
    this.y += dy;
  }

  async up() {
    // Rest a moment so the release speed reads as zero.
    await new Promise((r) => setTimeout(r, 150));
    await this.cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await this.cdp.detach();
  }
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
    await expect(tabs).toHaveCount(3);
    const heights = await tabs.evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect().height),
    );
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(48);
    for (let i = 0; i < 3; i++) {
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

  test("@small the screen does not scroll sideways", async ({ page }) => {
    await openSection(page);
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page.locator("button.MuiTab-root:visible"), 44);
  });
});

test.describe("swipeable tabs", () => {
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

  test("the first 24px at the screen edge are left alone", async ({
    page,
  }, info) => {
    test.skip(info.project.name === "desktop", "the pane is not at the edge");
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

  test("under reduced motion the change is instant", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { box } = await openSection(page);
    const f = await Finger.down(
      page,
      box.x + box.width * 0.8,
      box.y + box.height / 2,
    );
    await f.moveBy(-box.width * 0.55);
    await f.up();
    // Inside the shortest settle time, which an animation would exceed.
    await expect(tab(page, "Logs")).toHaveAttribute("aria-selected", "true", {
      timeout: 80,
    });
  });
});
