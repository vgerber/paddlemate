import { expect, type Page, test } from "@playwright/test";
import {
  appReady,
  computed,
  expectNoHorizontalOverflow,
  expectTouchTargets,
  gotoSection,
} from "../support/fixture";
import { keepUnread } from "../support/notifications";

// The app shell as the calm design draws it: a white app bar on desktop, a
// bottom nav with a soft pill on a phone, a side panel on desktop and a
// full-screen overlay on a phone, the bell as a floating card, tools as cards.

const TEAL = "rgb(14, 116, 144)";
const E1 =
  "rgba(31, 43, 49, 0.08) 0px 1px 2px 0px, rgba(31, 43, 49, 0.04) 0px 1px 1px 0px";
const E2 =
  "rgba(31, 43, 49, 0.12) 0px 8px 24px 0px, rgba(31, 43, 49, 0.08) 0px 2px 6px 0px";

const isDesktop = (project: string) => project === "desktop";
const bottomNav = (page: Page) =>
  page.getByRole("navigation", { name: "Main" });
const appBar = (page: Page) => page.locator("header.MuiAppBar-root");

/** All CSS the page has loaded, as one string. */
const pageCss = (page: Page) =>
  page.evaluate(() =>
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

test.describe("desktop app bar", () => {
  test.beforeEach(({ page: _page }, info) => {
    test.skip(!isDesktop(info.project.name), "desktop only");
  });

  test("white, floating at e1, with the teal wordmark in sentence case", async ({
    page,
  }) => {
    await page.goto("/tools");
    const bar = appBar(page);
    await expect(bar).toBeVisible();
    expect(await computed(bar, "background-color")).toBe("rgb(255, 255, 255)");
    expect(await computed(bar, "box-shadow")).toBe(E1);
    const logo = bar.getByText("Paddlemate", { exact: true });
    await expect(logo).toBeVisible();
    expect(await computed(logo, "color")).toBe(TEAL);
    expect(await computed(logo, "font-size")).toBe("18px");
    expect(await computed(logo, "text-transform")).toBe("none");
  });

  test("text navigation in sentence case; the current one is a soft teal pill", async ({
    page,
  }) => {
    await page.goto("/tools");
    const bar = appBar(page);
    for (const name of ["Map", "Logs", "Trips", "Tools"]) {
      const link = bar.getByRole("link", { name, exact: true });
      await expect(link).toBeVisible();
      expect(await computed(link, "text-transform")).toBe("none");
    }
    const current = bar.getByRole("link", { name: "Tools", exact: true });
    await expect(current).toHaveAttribute("aria-current", "page");
    expect(await computed(current, "color")).toBe(TEAL);
    expect(await computed(current, "background-color")).toBe(
      "rgba(14, 116, 144, 0.12)",
    );
    expect(await computed(current, "border-radius")).toBe("10px");
    const other = bar.getByRole("link", { name: "Logs", exact: true });
    await expect(other).not.toHaveAttribute("aria-current", "page");
    expect(await computed(other, "background-color")).toBe("rgba(0, 0, 0, 0)");
  });

  test("the bell, the avatar and the user name sit at the right edge", async ({
    page,
  }) => {
    await page.goto("/tools");
    const bar = appBar(page);
    await expect(
      bar.getByRole("button", { name: /notifications/i }),
    ).toBeVisible();
    const menu = bar.getByRole("button", { name: /vincent/i });
    await expect(menu).toBeVisible();
    await expect(menu.getByTestId("user-avatar")).toBeVisible();
    const box = await menu.boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeGreaterThan(1280 - 40);
  });

  test("the app bar is 56px and a list card runs the rest of the window, 16px clear", async ({
    page,
  }) => {
    for (const path of ["/", "/trips"]) {
      await page.goto(path);
      const bar = await appBar(page).boundingBox();
      expect(bar?.height).toBe(56);
      const pane = page.locator('[data-testid^="canvas-card-"]').first();
      await expect(pane).toBeVisible();
      const box = await pane.boundingBox();
      const vh = page.viewportSize()?.height ?? 0;
      expect(box?.y, `${path} card top`).toBe(56 + 16);
      expect(box?.height, `${path} card height`).toBe(vh - 56 - 2 * 16);
    }
  });

  test("there is no bottom nav", async ({ page }) => {
    await page.goto("/tools");
    await expect(bottomNav(page)).toBeHidden();
  });

  test("the bell opens a floating card with the card radius and e2 shadow", async ({
    page,
  }) => {
    await keepUnread(page);
    await page.goto("/tools");
    await appBar(page)
      .getByRole("button", { name: /notifications/i })
      .click();
    const card = page.locator(".MuiPopover-paper");
    await expect(card).toBeVisible();
    await expect(card.getByText("Trip changes")).toBeVisible();
    // Six pixels clear of the bar, not overlapping it.
    await expect.poll(async () => (await card.boundingBox())?.y).toBe(62);
    expect(await computed(card, "border-radius")).toBe("16px");
    expect(await computed(card, "box-shadow")).toBe(E2);
    const rows = card.getByRole("button");
    const empty = card.getByTestId("empty-state");
    await expect(rows.first().or(empty)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(card).toBeHidden();
  });

  test("a section opens in the floating panel over the map, without a hard border", async ({
    page,
  }) => {
    await gotoSection(page, "lower");
    const panel = page.getByTestId("side-panel");
    await expect(panel).toBeVisible();
    await expect(page.getByTestId("mobile-overlay")).toBeHidden();
    expect(await computed(panel, "border-right-width")).toBe("0px");
    expect(await computed(panel, "background-color")).toBe(
      "rgb(238, 242, 243)",
    );
    const box = await panel.boundingBox();
    // tokens.canvas.cards.detail.min: 26% of 1280 is under it.
    expect(box?.x).toBe(16);
    expect(box?.width).toBe(340);
    await expect(
      panel.getByRole("button", { name: "Back" }).first(),
    ).toBeVisible();
  });

  test("back in the panel closes the section", async ({ page }) => {
    await gotoSection(page, "lower");
    const panel = page.getByTestId("side-panel");
    await panel.getByRole("button", { name: "Back" }).first().click();
    await expect(page).not.toHaveURL(/section=/);
  });
});

test.describe("phone bottom navigation", () => {
  test.beforeEach(({ page: _page }, info) => {
    test.skip(isDesktop(info.project.name), "phone only");
  });

  test("four items with icon and label, each a target a thumb can hit @small", async ({
    page,
  }) => {
    await page.goto("/tools");
    const nav = bottomNav(page);
    await expect(nav).toBeVisible();
    const items = nav.getByRole("link");
    await expect(items).toHaveText(["Map", "Logs", "Trips", "Profile"]);
    await expect(nav.locator("svg")).toHaveCount(4);
    await expectTouchTargets(items);
    for (const item of await items.all()) {
      expect(await computed(item, "text-transform")).toBe("none");
    }
    await expectNoHorizontalOverflow(page);
  });

  test("the current item has a soft teal pill behind its icon", async ({
    page,
  }) => {
    await page.goto("/logs");
    const nav = bottomNav(page);
    const current = nav.getByRole("link", { name: "Logs" });
    await expect(current).toHaveAttribute("aria-current", "page");
    const pill = current.getByTestId("nav-pill");
    expect(await computed(pill, "color")).toBe(TEAL);
    expect(await computed(pill, "background-color")).toBe("rgb(224, 242, 246)");
    expect(await computed(pill, "border-radius")).toBe("999px");
    const other = nav.getByRole("link", { name: "Trips" });
    await expect(other).not.toHaveAttribute("aria-current", "page");
    expect(
      await computed(other.getByTestId("nav-pill"), "background-color"),
    ).toBe("rgba(0, 0, 0, 0)");
  });

  test("Tools lives under Profile, which stays marked", async ({ page }) => {
    await page.goto("/tools");
    await expect(
      bottomNav(page).getByRole("link", { name: "Profile" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("the nav has no hard top border and pads for the safe area", async ({
    page,
  }) => {
    await page.goto("/tools");
    const nav = bottomNav(page);
    await expect(nav).toBeVisible();
    expect(await computed(nav, "border-top-width")).toBe("0px");
    expect(await pageCss(page)).toContain("safe-area-inset-bottom");
  });

  test("the nav is 64px and the map pane ends exactly at its top", async ({
    page,
  }) => {
    await page.goto("/");
    await appReady(page);
    const nav = await bottomNav(page).boundingBox();
    expect(nav?.height).toBe(64);
    const pane = await page.locator("main > *").first().boundingBox();
    expect(pane?.y).toBe(0);
    expect((pane?.y ?? 0) + (pane?.height ?? 0)).toBe(nav?.y);
  });

  test("there is no app bar", async ({ page }) => {
    await page.goto("/tools");
    await expect(appBar(page)).toBeHidden();
  });

  test("a section opens as a full-screen overlay above the map @small", async ({
    page,
  }) => {
    await gotoSection(page, "lower");
    const overlay = page.getByTestId("mobile-overlay");
    await expect(overlay).toBeVisible();
    await expect(page.getByTestId("side-panel")).toBeHidden();
    const box = await overlay.boundingBox();
    const vp = page.viewportSize();
    expect(box?.x).toBe(0);
    expect(box?.width).toBe(vp?.width);
    expect(box?.y).toBe(0);
    await expectNoHorizontalOverflow(page);
  });

  test("the list opens as an overlay and the browser back closes it", async ({
    page,
  }) => {
    await page.goto("/");
    await appReady(page);
    await page.getByRole("button", { name: "Open search panel" }).click();
    const overlay = page.getByTestId("mobile-overlay");
    await expect(overlay).toBeVisible();
    await page.goBack();
    await expect(overlay).toBeHidden();
  });

  test("the overlay ends above the bottom nav", async ({ page }) => {
    await gotoSection(page, "lower");
    const overlay = page.getByTestId("mobile-overlay");
    await expect(overlay).toBeVisible();
    const o = await overlay.boundingBox();
    const n = await bottomNav(page).boundingBox();
    expect((o?.y ?? 0) + (o?.height ?? 0)).toBeLessThanOrEqual(n?.y ?? 0);
  });
});

test.describe("tools", () => {
  test("tiles are cards with a soft teal icon tile @small", async ({
    page,
  }) => {
    await page.goto("/tools");
    await expect(page.getByRole("heading", { name: "Tools" })).toBeVisible();
    const tile = page.getByRole("link", { name: /Proposals/ });
    await expect(tile).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Gauge coverage/ }),
    ).toBeVisible();
    expect(await computed(tile, "background-color")).toBe("rgb(255, 255, 255)");
    expect(await computed(tile, "border-radius")).toBe("14px");
    expect(await computed(tile, "box-shadow")).toBe(E1);
    expect(await computed(tile, "border-top-width")).toBe("0px");
    const icon = tile.getByTestId("tool-icon");
    expect(await computed(icon, "background-color")).toBe(
      "rgba(14, 116, 144, 0.12)",
    );
    expect(await computed(icon, "border-radius")).toBe("12px");
    await expectTouchTargets(
      page.getByRole("link", { name: /Proposals|Gauge coverage/ }),
    );
    await expectNoHorizontalOverflow(page);
  });

  test("a tile opens its tool", async ({ page }) => {
    await page.goto("/tools");
    await page.getByRole("link", { name: /Proposals/ }).click();
    await expect(page).toHaveURL(/\/proposals/);
  });
});
