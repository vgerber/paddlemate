import { expect, type Page, test } from "@playwright/test";
import { openEntryMenu } from "../support/entryMenu";
import { expectNoHorizontalOverflow } from "../support/fixture";

// The one menu of a wiki entry's page and the left edge of its column.
// 9852 is Testflow Cascade M (three sizes, no photo); 9861 Photocraft Lens has
// a photo; 9863 Vanishco Ghost has two photos. The stored session is the
// admin Vincent.

const ENTRY = 9852;

async function menuLabels(page: Page): Promise<string[]> {
  await openEntryMenu(page);
  return page.getByRole("menuitem").allInnerTexts();
}

const BASE = ["Suggest a change", "Add photo", "Compare sizes"];

test.describe("the entry menu", () => {
  test("an admin sees the actions in order, removals after the rule", async ({
    page,
  }) => {
    await page.goto(`/materials/${ENTRY}`);
    expect(await menuLabels(page)).toEqual([...BASE, "Delete entry"]);

    await page.keyboard.press("Escape");
    await page.goto("/materials/9863");
    const labels = await menuLabels(page);
    expect(labels.slice(0, 2)).toEqual(BASE.slice(0, 2));
    expect(labels.slice(-2)).toEqual([
      "Remove all Vanishco photos",
      "Delete entry",
    ]);
    const removals = labels.filter((label) =>
      label.startsWith("Remove photo: "),
    );
    expect(removals.length).toBeGreaterThanOrEqual(2);
    // Named by the credit, never by a number.
    for (const label of removals) expect(label).not.toMatch(/\b\d+$/);
    expect(new Set(removals).size).toBe(removals.length);
    await expectNoHorizontalOverflow(page);
  });

  test.describe("a signed-in paddler who is not an admin", () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        for (const key of Object.keys(localStorage)) {
          if (!key.startsWith("oidc.user:")) continue;
          const user = JSON.parse(localStorage.getItem(key) ?? "{}");
          user.profile.realm_access = { roles: [] };
          localStorage.setItem(key, JSON.stringify(user));
        }
      });
    });

    test("has no removals of photos", async ({ page }) => {
      await page.goto("/materials/9863");
      const labels = await menuLabels(page);
      expect(labels).toEqual([
        ...labels.slice(0, 0),
        "Suggest a change",
        "Add photo",
        "Delete entry",
      ]);
    });
  });

  test.describe("signed out", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("offers the open actions and Suggest a change leads to sign-in @small", async ({
      page,
    }) => {
      await page.goto(`/materials/${ENTRY}`);
      expect(await menuLabels(page)).toEqual(BASE);
      await page.getByRole("menuitem", { name: "Suggest a change" }).click();
      await expect(page.getByTestId("state-card")).toContainText(
        "Sign in to suggest a change",
      );
    });
  });
});

test("the model page column has one left edge @desktop", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1280, "desktop layout");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/materials/9861");
  await expect(page.getByTestId("material-photo").first()).toBeVisible();
  const left = async (locator: ReturnType<Page["locator"]>) =>
    (await locator.first().boundingBox())?.x ?? Number.NaN;

  // Cards and tiles share one edge; text inside them one inset.
  const card = await left(page.getByTestId("overview").locator("xpath=.."));
  const tile = await left(page.getByTestId("material-photo"));
  expect(Math.abs(card - tile)).toBeLessThanOrEqual(1);

  const text = await left(page.getByTestId("fact-label"));
  const heading = await left(page.getByRole("heading", { name: "Overview" }));
  const credit = await left(page.getByTestId("photo-credit").locator("span"));
  expect(Math.abs(text - heading)).toBeLessThanOrEqual(1);
  expect(Math.abs(text - credit)).toBeLessThanOrEqual(1);
});
