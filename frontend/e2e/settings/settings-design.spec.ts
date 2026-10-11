import { expect, type Page, test } from "@playwright/test";
import { computed } from "../support/fixture";
import { emptyInbox, mixedInbox } from "../support/notifications";

const TEAL = "rgb(14, 116, 144)";
const SECONDARY = "rgb(88, 102, 109)";
const DANGER = "rgb(180, 55, 63)";

const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 768;
const list = (page: Page) => page.getByTestId("settings-list");

test.describe("settings list rows", () => {
  test("a row has the design's padding, type and spacing", async ({ page }) => {
    await page.goto("/settings");
    const row = list(page).getByRole("button", { name: "Display language" });
    await expect(row).toBeVisible();
    expect(await computed(row, "padding")).toBe("10px 14px");
    expect(await computed(row, "border-radius")).toBe("12px");
    const title = row.getByText("Display language", { exact: true });
    expect(await computed(title, "font-weight")).toBe("500");
    expect(await computed(title, "line-height")).toBe("20px");
    const hint = row.locator("p").nth(1);
    expect(await computed(hint, "font-size")).toBe("13px");
    expect(await computed(hint, "color")).toBe(SECONDARY);
    expect(await computed(list(page), "row-gap")).toBe("6px");
    expect(await computed(list(page), "padding")).toBe("12px");
  });

  test("the open group is a white card with a ring; focus looks different", async ({
    page,
  }) => {
    test.skip(!isDesktop(page), "a phone has no open group");
    await page.goto("/settings?group=account");
    const open = list(page).getByRole("button", { name: "Account" });
    expect(await computed(open, "background-color")).toBe("rgb(255, 255, 255)");
    const shadow = await computed(open, "box-shadow");
    expect(shadow).toContain(TEAL);
    expect(shadow).toContain("inset");
    expect(shadow).toContain("2px");

    const other = list(page).getByRole("button", { name: "Access tokens" });
    await page.keyboard.press("Tab");
    await other.focus();
    await expect(other).toHaveClass(/Mui-focusVisible/);
    expect(await computed(other, "background-color")).not.toBe(
      "rgb(255, 255, 255)",
    );
    expect(await computed(other, "outline-style")).toBe("solid");
    expect(await computed(other, "outline-color")).toBe(TEAL);
    expect(await computed(open, "outline-style")).toBe("none");
  });
});

test.describe("settings detail", () => {
  test("desktop: the section is a white card with an 18px title", async ({
    page,
  }) => {
    test.skip(!isDesktop(page), "the card is the desktop pane");
    await page.goto("/settings?group=account");
    const title = page
      .getByTestId("settings-detail")
      .getByRole("heading", { name: "Account" });
    await expect(title).toBeVisible();
    expect(await computed(title, "font-size")).toBe("18px");
    expect(await computed(title, "font-weight")).toBe("700");
    const card = title.locator("..");
    expect(await computed(card, "background-color")).toBe("rgb(255, 255, 255)");
    expect(await computed(card, "border-radius")).toBe("16px");
    expect((await card.boundingBox())?.width).toBeLessThanOrEqual(880);
    await expect(
      page.getByTestId("settings-detail").getByText("Signed in as"),
    ).toHaveCount(0);
  });

  test("account facts and the sign out colour", async ({ page }) => {
    await page.goto("/settings?group=account");
    const detail = page.getByTestId("settings-detail");
    await expect(detail.getByTestId("fact-label").first()).toBeVisible();
    const name = detail.getByText("Username").locator("+ *");
    expect(await computed(name, "font-size")).toBe("16px");
    expect(await computed(name, "font-weight")).toBe("600");
    const id = detail.getByText("User ID").locator("+ * span");
    expect(await computed(id, "font-size")).toBe("14px");
    expect(await computed(id, "font-weight")).toBe("500");
    const signOut = detail.getByRole("button", { name: "Sign out" });
    expect(await computed(signOut, "color")).toBe(DANGER);
    const link = detail.getByRole("link", { name: "Account settings" });
    expect(await computed(link, "color")).not.toBe(DANGER);
  });

  test("the version line is a quiet 13px", async ({ page }) => {
    await page.goto("/settings");
    const version = page.getByText(/^v[0-9a-f]{7}/).first();
    await expect(version).toBeVisible();
    expect(await computed(version, "font-size")).toBe("13px");
    expect(await computed(version, "font-weight")).toBe("500");
    expect(await computed(version, "color")).toBe(SECONDARY);
  });
});

test.describe("notification settings and tokens", () => {
  test("the push switch uses calm tokens and a 44px hit area", async ({
    page,
  }) => {
    await page.goto("/settings?group=notifications");
    const sw = page.locator("[data-testid=push-row] .MuiSwitch-root");
    await expect(page.getByTestId("push-device-state")).toBeVisible();
    test.skip((await sw.count()) === 0, "push is not available here");
    const box = await sw.locator(".MuiSwitch-switchBase").boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    const track = sw.locator(".MuiSwitch-track");
    expect(await computed(track, "background-color")).toBe(
      "rgb(124, 138, 144)",
    );
    expect(await computed(sw.locator(".MuiSwitch-thumb"), "color")).toBe(
      "rgb(255, 255, 255)",
    );
  });

  test("the disabled Create button and token meta use tokens", async ({
    page,
  }) => {
    await page.goto("/settings?group=tokens");
    const create = page.getByRole("button", { name: "Create" });
    await expect(create).toBeDisabled();
    expect(await computed(create, "background-color")).toBe(
      "rgb(221, 228, 231)",
    );
    expect(await computed(create, "color")).toBe("rgb(124, 138, 144)");
    const meta = page
      .getByTestId("token-row")
      .first()
      .getByText(/Last used/);
    await expect(meta).toBeVisible();
    expect(await computed(meta, "font-size")).toBe("13px");
    expect(await computed(meta, "color")).toBe(SECONDARY);
  });
});

test.describe("inbox", () => {
  test("empty: a bell tile, 60px below the tabs, 16px title", async ({
    page,
  }) => {
    test.skip(isDesktop(page), "the inbox is a tab on a phone");
    await emptyInbox(page);
    await page.goto("/settings");
    await page.getByRole("tab", { name: "Inbox" }).click();
    const empty = page.getByTestId("empty-state");
    await expect(empty).toBeVisible();
    await expect(
      empty.locator('[data-testid="NotificationsNoneOutlinedIcon"]'),
    ).toBeVisible();
    expect(await computed(empty, "padding-top")).toBe("60px");
    const title = empty.getByText("Nothing new", { exact: true });
    expect(await computed(title, "font-size")).toBe("16px");
    expect(await computed(title, "font-weight")).toBe("600");
    const caption = empty.getByText(/Changes others make/);
    expect(await computed(caption, "font-size")).toBe("14px");
    expect(await computed(caption, "color")).toBe(SECONDARY);
  });

  test("rows: 14px text, quiet meta, each row a white card", async ({
    page,
  }) => {
    test.skip(isDesktop(page), "the inbox is a tab on a phone");
    await mixedInbox(page);
    await page.goto("/settings");
    await page.getByRole("tab", { name: "Inbox" }).click();
    const rows = page
      .locator(".MuiListItemButton-root")
      .filter({ hasText: "·" });
    await expect(rows.first()).toBeVisible();
    const n = await rows.count();
    expect(n).toBeGreaterThan(1);
    const text = rows.first().locator("p").first();
    expect(await computed(text, "font-size")).toBe("14px");
    const meta = rows.first().locator("p").nth(1);
    expect(await computed(meta, "font-size")).toBe("13px");
    expect(await computed(meta, "color")).toBe(SECONDARY);
    expect(await computed(rows.first(), "background-color")).toBe(
      "rgb(255, 255, 255)",
    );
    expect(await computed(rows.first(), "border-top-left-radius")).toBe("14px");
    expect(await computed(rows.first(), "border-bottom-width")).toBe("0px");
    const weights = await rows.evaluateAll((els) =>
      els.map(
        (el) => getComputedStyle(el.querySelector("p") as Element).fontWeight,
      ),
    );
    expect(new Set(weights)).toEqual(new Set(["600", "500"]));
  });
});

test.describe("tools page", () => {
  test("type steps, a capped grid and a list glyph", async ({ page }) => {
    await page.goto("/tools");
    const tile = page.getByRole("link", { name: /Proposals/ });
    await expect(tile).toBeVisible();
    const sub = page.getByText(/^Utilities for exploring/);
    expect(await computed(sub, "font-size")).toBe("15px");
    expect(await computed(sub, "color")).toBe(SECONDARY);
    const desc = tile.getByText(/Review and submit/);
    expect(await computed(desc, "font-size")).toBe("14px");
    expect(await computed(desc, "color")).toBe(SECONDARY);
    const count = tile.locator("p").last();
    expect(await computed(count, "font-size")).toBe("14px");
    expect(await computed(count, "font-weight")).toBe("600");
    expect(await computed(count, "color")).toBe(SECONDARY);
    await expect(
      tile.locator('[data-testid="ListAltOutlinedIcon"]'),
    ).toBeVisible();
    const grid = tile.locator("..");
    expect((await grid.boundingBox())?.width).toBeLessThanOrEqual(700);
  });
});
