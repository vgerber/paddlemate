import { expect, type Page, test } from "@playwright/test";
import {
  computed,
  expectNoHorizontalOverflow,
  expectTouchTargets,
} from "../support/fixture";

const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 768;

/** The open section's title, in the panel header of either layout. */
const title = (page: Page, text: string) =>
  page.getByTestId("settings-detail").getByText(text, { exact: true }).first();

const GROUPS = [
  ["account", "Account"],
  ["language", "Display language"],
  ["notifications", "Notifications"],
  ["tokens", "Access tokens"],
] as const;

test.describe("settings layout", () => {
  test("desktop: groups beside the open section, linkable", async ({
    page,
  }) => {
    test.skip(!isDesktop(page), "two panes start at md");
    await page.goto("/settings");
    const list = page.getByTestId("settings-list");
    await expect(list).toBeVisible();
    expect(await computed(list, "background-color")).toBe("rgb(238, 242, 243)");
    for (const [, label] of GROUPS) {
      await expect(list.getByRole("button", { name: label })).toBeVisible();
    }
    // The account opens by default and the detail sits right of the list.
    await expect(title(page, "Account")).toBeVisible();
    // The pane keeps the title and drops only the back arrow.
    await expect(
      page.getByTestId("settings-detail").getByRole("button", { name: "Back" }),
    ).toHaveCount(0);
    const l = await list.boundingBox();
    const d = await page.getByTestId("settings-detail").boundingBox();
    expect(d?.x ?? 0).toBeGreaterThanOrEqual((l?.x ?? 0) + (l?.width ?? 0) - 1);

    await list.getByRole("button", { name: "Access tokens" }).click();
    await expect(page).toHaveURL(/group=tokens/);
    await expect(title(page, "Access tokens")).toBeVisible();

    await page.goto("/settings?group=notifications");
    await expect(title(page, "Notifications")).toBeVisible();
  });

  test("phone: a list that opens each section as an overlay", async ({
    page,
  }) => {
    test.skip(isDesktop(page), "overlay is the phone layout");
    await page.goto("/settings");
    const list = page.getByTestId("settings-list");
    await expect(list).toBeVisible();
    await expect(page.getByTestId("settings-detail")).toHaveCount(0);
    await list.getByRole("button", { name: "Display language" }).click();
    await expect(page).toHaveURL(/group=language/);
    await expect(page.getByTestId("settings-detail")).toBeVisible();
    await expect(title(page, "Display language")).toBeVisible();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByTestId("settings-detail")).toHaveCount(0);
    await expect(list).toBeVisible();
    // A section address opens straight onto the overlay.
    await page.goto("/settings?group=tokens");
    await expect(title(page, "Access tokens")).toBeVisible();
  });

  test("rows and controls are touch sized, inputs are 16px", async ({
    page,
  }) => {
    await page.goto("/settings?group=account");
    await expect(page.getByTestId("settings-detail")).toBeVisible();
    if (!isDesktop(page)) await page.goto("/settings");
    await expectTouchTargets(
      page.locator(
        "[data-testid=settings-list] .MuiListItemButton-root:visible",
      ),
      48,
    );
    for (const group of ["account", "notifications", "tokens"]) {
      await page.goto(`/settings?group=${group}`);
      await expect(page.getByTestId("settings-detail")).toBeVisible();
      await expectTouchTargets(
        page.locator(
          "[data-testid=settings-detail] button:visible, [data-testid=push-row], [data-testid=settings-detail] a:visible",
        ),
      );
    }
    await page.goto("/settings?group=tokens");
    const input = page.getByLabel("Token name");
    await expect(input).toBeVisible();
    expect(await computed(input, "font-size")).toBe("16px");
    const field = input.locator(
      "xpath=ancestor::div[contains(@class,'MuiInputBase-root')]",
    );
    expect((await field.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  });

  test("buttons are sentence case", async ({ page }) => {
    await page.goto("/settings?group=account");
    await expect(
      page.getByRole("link", { name: "Account settings" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    const controls = page.locator(
      "[data-testid=settings-detail] .MuiButton-root:visible",
    );
    for (const c of await controls.all()) {
      expect(await computed(c, "text-transform")).toBe("none");
    }
  });

  test("push settings: a hint per kind and the device state", async ({
    page,
  }) => {
    await page.goto("/settings?group=notifications");
    const detail = page.getByTestId("settings-detail");
    await expect(detail.getByTestId("push-hint")).toBeVisible();
    await expect(detail.getByTestId("push-device-state")).toBeVisible();
  });

  test("nothing scrolls sideways @small", async ({ page }) => {
    for (const [id] of GROUPS) {
      await page.goto(`/settings?group=${id}`);
      await expect(page.getByTestId("settings-detail")).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
    await page.goto("/settings");
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("access tokens", () => {
  test("a token is shown once, then revoked after a confirmation", async ({
    page,
  }) => {
    const name = `wp12-${Date.now()}`;
    await page.goto("/settings?group=tokens");
    await page.getByLabel("Token name").fill(name);
    await page.getByRole("button", { name: "Create" }).click();

    const card = page.getByTestId("new-token");
    await expect(card).toBeVisible();
    await expect(card.getByText("won't be shown again")).toBeVisible();
    await expect(
      card.getByRole("button", { name: "Copy token" }),
    ).toBeVisible();
    expect(await computed(card, "border-top-left-radius")).toBe("14px");

    const row = page.getByTestId("token-row").filter({ hasText: name });
    await expect(row).toBeVisible();
    expect((await row.boundingBox())?.height).toBeGreaterThanOrEqual(48);
    await row.getByRole("button", { name: "Token actions" }).click();
    await page.getByRole("menuitem", { name: "Revoke" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Revoke token?")).toBeVisible();
    // Cancelling keeps the token.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: "Token actions" }).click();
    await page.getByRole("menuitem", { name: "Revoke" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Revoke" })
      .click();
    await expect(row).toHaveCount(0);
  });
});

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("trips and logs show the same card", async ({ page }) => {
    for (const [path, title] of [
      ["/trips", "Sign in to plan trips"],
      ["/logs", "Sign in to view your logs"],
    ] as const) {
      await page.goto(path);
      const card = page.getByTestId("state-card");
      await expect(card).toContainText(title);
      await expect(
        card.getByRole("button", { name: "Sign in", exact: true }),
      ).toBeVisible();
      await expect(
        card.getByRole("button", { name: "New here? Create an account" }),
      ).toBeVisible();
    }
  });

  test("settings shows the sign-in card, in sentence case", async ({
    page,
  }) => {
    await page.goto("/settings");
    await expect(page.getByText("Sign in to access settings")).toBeVisible();
    const signIn = page
      .getByRole("main")
      .getByRole("button", { name: "Sign in", exact: true });
    await expect(signIn).toBeVisible();
    expect(await computed(signIn, "text-transform")).toBe("none");
    expect(await computed(signIn, "background-color")).toBe(
      "rgb(14, 116, 144)",
    );
    expect((await signIn.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await expect(
      page.getByRole("button", { name: "New here? Create an account" }),
    ).toBeVisible();
    const card = page.getByTestId("state-card");
    await expect(card).toBeVisible();
    expect(await computed(card, "border-top-left-radius")).toBe("14px");
    await expectNoHorizontalOverflow(page);
  });
});
