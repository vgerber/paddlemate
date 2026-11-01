import { expect, type Page, test } from "@playwright/test";
import { API } from "../support/signIn";

// Every dropdown of the entry form opens and takes a click on an option.
// The form sits in a layer over the bottom nav; a menu left under it opens
// but its options can not be reached. Nothing is saved.

async function selectNames(page: Page) {
  return page.locator('[role="combobox"].MuiSelect-select').evaluateAll((els) =>
    els.map((el) => {
      const id = el.getAttribute("aria-labelledby")?.split(" ")[0] ?? "";
      return document.getElementById(id)?.textContent?.trim() ?? "";
    }),
  );
}

async function pickOther(page: Page, name: string) {
  const select = page.getByRole("combobox", { name, exact: true });
  // An empty select shows a zero-width space.
  const before = (await select.textContent())?.replace(/\u200b/g, "").trim();
  await select.click();
  const options = page.getByRole("option");
  const texts = (await options.allTextContents()).map((t) => t.trim());
  const target = texts.findIndex((t) => t !== before && t !== "Unstated");
  expect(target, `${name} has a second option`).toBeGreaterThanOrEqual(0);
  await options.nth(target).click();
  await expect(options).toHaveCount(0);
  await expect(select).not.toHaveText(before ?? "");
}

async function pickEverySelect(page: Page) {
  await expect(page.getByLabel("Brand")).toBeVisible();
  const names = await selectNames(page);
  expect(names.length).toBeGreaterThanOrEqual(3);
  expect(names.every((n) => n !== "")).toBe(true);
  // The category changes which fields exist, so it goes last.
  for (const name of names.filter((n) => n !== "Category")) {
    await pickOther(page, name);
  }
  await pickOther(page, "Category");
}

async function pickGroup(page: Page) {
  const field = page.getByRole("combobox", { name: /^Groups/ });
  const chips = page.locator(".MuiAutocomplete-root .MuiChip-root");
  const before = await chips.count();
  await field.click();
  await page.getByRole("option").first().click();
  await expect(chips).toHaveCount(before + 1);
}

test.describe("entry form dropdowns", () => {
  test("every dropdown of a new entry takes a click on an option", async ({
    page,
  }) => {
    await page.goto("/materials/new");
    await pickEverySelect(page);
    await pickGroup(page);
  });

  test("every dropdown of an edited entry takes a click on an option", async ({
    page,
  }) => {
    const res = await page.request.get(
      `${API}/api/v1/materials?category=kayak&per_page=1`,
    );
    expect(res.status()).toBe(200);
    const { items } = (await res.json()) as { items: { id: number }[] };
    await page.goto(`/materials/${items[0].id}?edit=true`);
    await pickEverySelect(page);
    await pickGroup(page);
  });
});
