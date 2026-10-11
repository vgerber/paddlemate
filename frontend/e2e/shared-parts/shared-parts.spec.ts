import { expect, type Page, type TestInfo, test } from "@playwright/test";
import { computed, expectTouchTargets, FIX } from "../support/fixture";

// The shared parts every screen is built from: panel header, list header,
// docked action, form fields and bar, visibility tiles, empty state, app
// shell and the standing descent banner (doc/design.md).

test.use({ hasTouch: true });

const INK2 = "rgb(88, 102, 109)";
const TEAL = "rgb(14, 116, 144)";
const isDesktop = (info: TestInfo) => info.project.name === "desktop";

async function standing(page: Page) {
  await page.addInitScript(
    ([k, v]) => localStorage.setItem(k, v),
    [
      "paddlemate_standing_descent",
      JSON.stringify({
        startTime: new Date(Date.now() - 600000).toISOString(),
        waterwayId: FIX.waterway,
        sectionId: FIX.sections.upper,
        sectionName: "Upper Test",
      }),
    ],
  );
}

test.describe("panel header", () => {
  test("a white bar with the e1 shadow, 13px ink2 subtitle, 22px ink arrow", async ({
    page,
  }, info) => {
    test.skip(isDesktop(info), "the phone header chrome");
    await page.goto(`/trips/${FIX.trips[0]}`);
    const subtitle = page.getByText("08 - 14 Oct 2026");
    await expect(subtitle).toBeVisible();
    expect(await computed(subtitle, "font-size")).toBe("13px");
    expect(await computed(subtitle, "color")).toBe(INK2);
    const bar = await subtitle.evaluate((el) => {
      let n: HTMLElement | null = el as HTMLElement;
      while (n && getComputedStyle(n).boxShadow === "none") n = n.parentElement;
      return n
        ? {
            bg: getComputedStyle(n).backgroundColor,
            shadow: getComputedStyle(n).boxShadow,
          }
        : null;
    });
    expect(bar?.bg).toBe("rgb(255, 255, 255)");
    expect(bar?.shadow).toContain("rgba(31, 43, 49, 0.08)");
    const arrow = page.getByRole("button", { name: "Back" }).locator("svg");
    expect(await computed(arrow, "font-size")).toBe("22px");
    expect(await computed(arrow, "color")).toBe("rgb(31, 43, 49)");
  });
});

test.describe("list pane", () => {
  test("the count says results and the tabs follow it directly", async ({
    page,
  }, info) => {
    test.skip(!isDesktop(info), "the list pane header is a desktop pane");
    await page.goto("/logs");
    const count = page.getByText(/^\d+ results?$/);
    await expect(count).toBeVisible();
    const tab = page.getByRole("tab", { name: "My logs" });
    const c = await count.boundingBox();
    const t = await tab.boundingBox();
    if (!c || !t) throw new Error("no boxes");
    expect(t.y - (c.y + c.height), "gap from count to tab").toBeLessThan(24);
    const tabs = await page.getByRole("tablist").boundingBox();
    expect(tabs?.x).toBe(16);
  });

  test("the docked action is a 12px-radius label-only button", async ({
    page,
  }, info) => {
    test.skip(!isDesktop(info), "docked actions are desktop only");
    await page.goto("/logs");
    const dock = page.getByRole("button", { name: "Log descent" });
    await expect(dock).toBeVisible();
    expect(await computed(dock, "border-top-left-radius")).toBe("12px");
    expect(await computed(dock, "font-size")).toBe("15px");
    expect(await dock.locator("svg").count()).toBe(0);
  });

  test("an empty detail pane reads as a quiet caption", async ({
    page,
  }, info) => {
    test.skip(!isDesktop(info), "the empty detail pane is desktop only");
    await page.goto("/proposals");
    const line = page.getByText("Select a proposal to review it.");
    await expect(line).toBeVisible();
    expect(await computed(line, "font-size")).toBe("14px");
    expect(await computed(line, "font-weight")).toBe("400");
    expect(await computed(line, "color")).toBe(INK2);
  });

  test("a focused log card shows a teal ring", async ({ page }) => {
    await page.goto("/logs");
    const card = page.getByTestId("descent-card").first();
    await expect(card).toBeVisible();
    await page.keyboard.press("Tab");
    await card.focus();
    expect(await computed(card, "outline-style")).toBe("solid");
    expect(await computed(card, "outline-color")).toBe(TEAL);
    // Drawn inside the card, so a scroller never clips it.
    expect(await computed(card, "outline-offset")).toBe("-2px");
  });
});

test.describe("facts", () => {
  test("values are 16px and sit side by side, not pushed apart", async ({
    page,
  }) => {
    await page.goto("/logs/9201");
    const labels = page.getByTestId("fact-label");
    await expect(labels.first()).toBeVisible();
    const value = labels.first().locator("xpath=following-sibling::*[1]");
    expect(await computed(value, "font-size")).toBe("16px");
    expect(await computed(value, "font-weight")).toBe("600");
    const a = await labels.nth(0).boundingBox();
    const b = await labels.nth(1).boundingBox();
    if (!a || !b) throw new Error("no fact boxes");
    const gap = b.x - (a.x + a.width);
    expect(gap, "gap between two facts").toBeLessThan(160);
  });
});

test.describe("forms", () => {
  test("a field keeps its label inside at 12px over a 16px value", async ({
    page,
  }) => {
    await page.goto("/trips/new");
    const field = page.getByLabel("Trip name");
    await expect(field).toBeVisible();
    expect(await computed(field, "font-size")).toBe("16px");
    const label = page.locator("label", { hasText: "Trip name" });
    expect(await computed(label, "transform")).toContain("0.75");
    // An empty field that is not focused keeps the label up too.
    await expect(page.locator("label", { hasText: "Description" })).toHaveClass(
      /MuiInputLabel-shrink/,
    );
    const root = field.locator(
      "xpath=ancestor::*[contains(@class,'MuiInputBase-root')]",
    );
    expect(await computed(root, "box-shadow")).toContain("inset");
  });

  test("the bar has a text cancel, a 52px rounded action and step bars", async ({
    page,
  }) => {
    await page.goto("/logs/new");
    const cancel = page.getByRole("button", { name: "Cancel" });
    await expect(cancel).toBeVisible();
    expect(await cancel.textContent()).toBe("Cancel");
    const bars = page.locator("[data-step-bar]");
    await expect(bars).toHaveCount(3);
    await expect(page.locator("[data-step-bar=done]")).toHaveCount(1);
    const action = page.getByRole("button", { name: "Next" });
    const box = await action.boundingBox();
    expect(box?.width).toBe(52);
    expect(box?.height).toBe(52);
    expect(await computed(action, "border-top-left-radius")).toBe("16px");
    await expectTouchTargets(cancel);
  });

  test("visibility is three separate tiles, the chosen one ringed", async ({
    page,
  }) => {
    await page.goto("/logs/new");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    const tiles = page.getByRole("radio");
    await expect(tiles).toHaveCount(3);
    await expectTouchTargets(tiles);
    const chosen = page.getByRole("radio", { checked: true });
    await expect(chosen).toHaveCount(1);
    expect(await computed(chosen, "box-shadow")).toContain("14, 116, 144");
    expect(await computed(chosen, "border-top-left-radius")).toBe("12px");
  });
});

test.describe("app shell", () => {
  test("Tools stays lit on the proposals screen", async ({ page }, info) => {
    test.skip(!isDesktop(info), "the top nav is desktop only");
    await page.goto("/proposals");
    await expect(
      page.locator("header").getByRole("link", { name: "Tools" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("the user menu says Sign out and has no caret", async ({
    page,
  }, info) => {
    test.skip(!isDesktop(info), "the user menu is in the desktop top bar");
    await page.goto("/tools");
    const user = page.getByTestId("user-avatar").locator("xpath=..");
    await expect(user).toBeVisible();
    expect(await user.locator("svg").count()).toBe(0);
    await user.click();
    await expect(
      page.getByRole("menuitem", { name: "Sign out", exact: true }),
    ).toBeVisible();
  });

  test("signed-out actions are sentence case and 44px", async ({
    browser,
  }, info) => {
    test.skip(!isDesktop(info), "the top bar is desktop only");
    const context = await browser.newContext({
      baseURL: info.project.use.baseURL,
      viewport: { width: 1280, height: 800 },
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await page.goto("/tools");
    const signIn = page
      .locator("header")
      .getByRole("button", { name: "Sign in" });
    await expect(signIn).toBeVisible();
    await expect(
      page.locator("header").getByRole("button", { name: "Create account" }),
    ).toBeVisible();
    await expectTouchTargets(page.locator("header button:visible"));
    await context.close();
  });
});

test.describe("standing descent banner", () => {
  test("one line on a phone and clear of the map keys", async ({
    page,
  }, info) => {
    test.skip(isDesktop(info), "the phone map overlay");
    await standing(page);
    await page.goto("/");
    const banner = page.locator("[data-testid=standing-banner]:visible");
    await expect(banner).toBeVisible();
    const box = await banner.boundingBox();
    const width = page.viewportSize()?.width ?? 0;
    expect(box?.height, "one line").toBeLessThanOrEqual(64);
    expect(
      (box?.x ?? 0) + (box?.width ?? 0),
      "clear of the right keys",
    ).toBeLessThanOrEqual(width - 56);
  });

  test("on a desktop it floats and the page keeps the viewport height", async ({
    page,
  }, info) => {
    test.skip(!isDesktop(info), "desktop layout");
    await standing(page);
    await page.goto("/logs");
    await expect(page.getByTestId("standing-banner").first()).toBeVisible();
    const over = await page.evaluate(
      () =>
        document.documentElement.scrollHeight -
        document.documentElement.clientHeight,
    );
    expect(over, "vertical overflow in px").toBeLessThanOrEqual(0);
    const dock = await page
      .getByRole("button", { name: "Log descent" })
      .boundingBox();
    expect(dock && dock.y + dock.height).toBeLessThanOrEqual(800);
  });
});
