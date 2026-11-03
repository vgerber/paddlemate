import { expect, type Page, test } from "@playwright/test";
import {
  expectNoHorizontalOverflow,
  expectTouchTargets,
} from "../support/fixture";

// The phone's back button steps out of a wiki layer (Browse levels, Filters,
// the photo viewer) before it leaves the page. Read-only.

test.beforeEach(({ page: _page }, info) => {
  test.skip(
    !info.project.name.startsWith("phone") &&
      !info.project.name.startsWith("small"),
    "phone control",
  );
});

const browse = (page: Page) => page.getByRole("dialog", { name: "Browse" });

async function openBrowse(page: Page) {
  await page.goto("/");
  await page.goto("/materials");
  await page.getByTestId("browse-button").click();
}

async function openCreek(page: Page) {
  await openBrowse(page);
  await browse(page)
    .getByRole("button", { name: /^Kayaks/ })
    .click();
  await browse(page)
    .getByRole("button", { name: /^Creek/ })
    .click();
}

test.describe("back button on a phone", () => {
  test("Browse steps Creek, Kayaks, root, closed, then leaves @small", async ({
    page,
  }) => {
    await openCreek(page);
    const sheet = browse(page);
    await page.goBack();
    await expect(sheet.getByRole("button", { name: /^Creek/ })).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: /^All Creek/ }),
    ).toBeHidden();
    await page.goBack();
    await expect(sheet.getByRole("button", { name: /^Canoes/ })).toBeVisible();
    await page.goBack();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/materials$/);
    await page.goBack();
    await expect(page).not.toHaveURL(/\/materials/);
  });

  test("a Browse sub-level has one back control, the 44px header arrow @small", async ({
    page,
  }) => {
    await openCreek(page);
    await expect(browse(page).getByTestId("browse-up")).toHaveCount(0);
    await expect(browse(page).getByText(/^Back to /)).toHaveCount(0);
    const back = browse(page).getByRole("button", { name: "Back" });
    await expect(back).toHaveCount(1);
    await expectTouchTargets(back);
    // One level up, not straight to the root.
    await back.click();
    await expect(
      browse(page).getByRole("button", { name: /^All Kayaks/ }),
    ).toBeVisible();
    await expect(
      browse(page).getByRole("button", { name: /^Canoes/ }),
    ).toBeHidden();
    await browse(page).getByRole("button", { name: "Back" }).click();
    await expect(
      browse(page).getByRole("button", { name: /^Canoes/ }),
    ).toBeVisible();
  });

  test("closing with X leaves no dead entry", async ({ page }) => {
    await openBrowse(page);
    await browse(page).getByRole("button", { name: "Close" }).click();
    await expect(browse(page)).toBeHidden();
    await page.waitForTimeout(300);
    await page.goBack();
    await expect(page).not.toHaveURL(/\/materials/);
  });

  test("a choice is kept and adds one history step", async ({ page }) => {
    await openBrowse(page);
    await browse(page)
      .getByRole("button", { name: /^Kayaks/ })
      .click();
    await browse(page)
      .getByRole("button", { name: /^All Kayaks/ })
      .click();
    await expect(browse(page)).toBeHidden();
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(/category=kayak/);
    // The choice is one step of its own: back shows the unfiltered list, and
    // one more leaves; the layer left nothing behind.
    await page.goBack();
    await expect(page).toHaveURL(/\/materials$/);
    await page.goBack();
    await expect(page).not.toHaveURL(/\/materials/);
  });

  test("Filters closes on back and the URL stays @small", async ({ page }) => {
    await page.goto("/");
    await page.goto("/materials");
    await page.getByTestId("filters-chip").click();
    const sheet = page.getByRole("dialog", { name: "Filters" });
    await expect(sheet).toBeVisible();
    await page.goBack();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/materials$/);
  });

  test("the photo viewer closes on back and the model page stays", async ({
    page,
  }) => {
    await page.goto("/materials");
    await page.goto("/materials/9863");
    await page.getByRole("button", { name: /View photo 1 of 2/ }).click();
    const viewer = page.getByRole("dialog", { name: "Photo viewer" });
    await expect(viewer).toBeVisible();
    await page.goBack();
    await expect(viewer).toBeHidden();
    await expect(page).toHaveURL(/\/materials\/9863(\?|$)/);
  });
});

test.describe("Browse chip", () => {
  test("shows the current pick and the search takes the full width @small", async ({
    page,
  }) => {
    await page.goto("/materials");
    const chip = page.getByTestId("browse-button");
    await expect(chip).toContainText("All gear");
    await expectTouchTargets(chip);
    await page.goto("/materials?category=kayak&discipline=creek");
    await expect(chip).toContainText("Kayaks · Creek");
    const search = await page.getByLabel("Brand or model").boundingBox();
    const vp = page.viewportSize();
    expect(search && vp && search.width > vp.width - 110).toBe(true);
    await expectNoHorizontalOverflow(page);
  });
});
