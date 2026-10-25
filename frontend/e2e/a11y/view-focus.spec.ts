import { expect, type Page, test } from "@playwright/test";
import { Finger } from "../support/finger";
import { FIX } from "../support/fixture";

// Keyboard users: a view change must leave focus inside the new view (or back
// on the opener), never on <body>, where the next Tab enters the bottom nav.

const inside = (page: Page, selector: string) =>
  page.evaluate((s) => Boolean(document.activeElement?.closest(s)), selector);

async function press(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true }).first();
  await button.focus();
  await page.keyboard.press("Enter");
}

test.describe("focus after a view change", () => {
  test("settings group: focus moves in, Back returns it to the row", async ({
    page,
  }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= 768, "a phone overlay");
    await page.goto("/settings");
    const row = page
      .getByTestId("settings-list")
      .getByRole("button", { name: "Display language" });
    await row.focus();
    await page.keyboard.press("Enter");
    const detail = page.getByTestId("settings-detail");
    await expect(detail).toBeVisible();
    await expect
      .poll(() => inside(page, "[data-testid=settings-detail]"))
      .toBe(true);
    await press(page, "Back");
    await expect(detail).toHaveCount(0);
    await expect(row).toBeFocused();
  });

  test("log form: Next, Back and Save keep focus in the view", async ({
    page,
  }) => {
    await page.goto(
      `/logs/new?waterwayId=${FIX.waterway}&sectionId=${FIX.sections.upper}`,
    );
    await expect(page.getByText("Step 1 of 3 · When")).toBeVisible();
    await press(page, "Next");
    await expect(page.getByText("Step 2 of 3 · Sections")).toBeVisible();
    await expect.poll(() => inside(page, "[data-step-enter]")).toBe(true);
    await press(page, "Next");
    await expect(page.getByText("Step 3 of 3")).toBeVisible();
    await expect.poll(() => inside(page, "[data-step-enter]")).toBe(true);
    await press(page, "Back");
    await expect(page.getByText("Step 2 of 3 · Sections")).toBeVisible();
    await expect.poll(() => inside(page, "[data-step-enter]")).toBe(true);
    await press(page, "Next");
    await press(page, "Save");
    await expect(page).toHaveURL(/\/logs\/\d+/);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const a = document.activeElement;
          return a !== document.body && a?.tagName === "H3";
        }),
      )
      .toBe(true);
    // Put the fixture back.
    await page.getByRole("button", { name: "Log actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page).toHaveURL(/\/logs$/);
  });

  test("add member sheet returns focus to its opener", async ({ page }) => {
    await page.goto(`/trips/${FIX.trips[0]}`);
    await page.getByRole("tab", { name: "Members", exact: true }).click();
    const opener = page.getByRole("button", { name: "Add member" });
    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
});

test.use({ hasTouch: true });

test("an error snackbar over an open sheet is reachable", async ({ page }) => {
  await page.goto("/dev/primitives");
  await page.getByRole("button", { name: "Open sheet" }).click();
  const sheet = page.getByLabel("Gallery sheet");
  const b = await sheet.boundingBox();
  if (!b) throw new Error("no sheet box");
  const f = await Finger.down(page, b.x + b.width / 2, b.y + 22);
  await f.moveBy(0, -300);
  await f.up();
  await expect(sheet).toHaveAttribute("role", "dialog");
  expect(
    await page.evaluate(() => document.getElementById("root")?.inert),
  ).toBe(true);
  const path = await page.evaluate(
    () =>
      performance
        .getEntriesByType("resource")
        .map((r) => r.name)
        .find((n) => n.includes("/src/components/AppSnackbar.tsx")) ?? "",
  );
  await page.evaluate(async (url) => {
    // The URL the app loaded (Vite adds ?t= after a hot update).
    const m = await import(/* @vite-ignore */ url);
    m.showErrorSnackbar("Sheet error");
  }, path);
  const alert = page.getByRole("alert").filter({ hasText: "Sheet error" });
  await expect(alert).toBeVisible();
  expect(await alert.evaluate((el) => Boolean(el.closest("[inert]")))).toBe(
    false,
  );
  await alert.getByRole("button", { name: "Close" }).click();
  await expect(alert).toHaveCount(0);
});
