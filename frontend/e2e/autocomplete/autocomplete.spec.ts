import { expect, type Locator, type Page, test } from "@playwright/test";
import { FIX } from "../support/fixture";

// The calm Autocomplete: icons centred in the field, text clear of them,
// chips under the label (lib/theme.ts MuiAutocomplete).

const visible = (l: Locator) => l.filter({ visible: true });

async function box(l: Locator) {
  const b = await l.boundingBox();
  if (!b) throw new Error("no box");
  return b;
}

async function gaugeField(page: Page) {
  await page.goto(`/?waterway=${FIX.waterway}&section=${FIX.sections.lower}`);
  await visible(page.getByRole("button", { name: "New feature" }))
    .first()
    .click();
  return visible(page.getByRole("combobox", { name: /gauge/i })).first();
}

async function groupsField(page: Page) {
  await page.goto(
    `/logs/new?waterwayId=${FIX.waterway}&sectionId=${FIX.sections.upper}`,
  );
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("radio", { name: "Shared" }).click();
  return page.getByRole("combobox", { name: "Groups" });
}

/** The padded field that holds a combobox. */
const root = (input: Locator) =>
  input.locator("xpath=ancestor::*[contains(@class,'MuiFilledInput-root')][1]");

test.describe("autocomplete", () => {
  test("the open button is centred in the field", async ({ page }) => {
    await page.goto("/settings?group=language");
    const input = page.getByRole("combobox", { name: "Language" });
    await expect(input).toBeVisible();
    const field = await box(root(input));
    const btn = await box(page.getByRole("button", { name: "Open" }).first());
    expect(field.height).toBeGreaterThan(50);
    expect(
      Math.abs(btn.y + btn.height / 2 - (field.y + field.height / 2)),
    ).toBeLessThanOrEqual(2);
  });

  test("typed text stops short of both icons (gauge)", async ({ page }) => {
    const input = await gaugeField(page);
    await input.click();
    await input.fill("Test Gauge");
    await visible(page.getByRole("option")).first().click();
    await input.hover();
    await input.focus();
    const clear = await box(
      visible(page.getByRole("button", { name: "Clear" })).first(),
    );
    const text = await input.evaluate((el) => {
      const i = el as HTMLInputElement;
      const r = i.getBoundingClientRect();
      const cs = getComputedStyle(i);
      return r.right - Number.parseFloat(cs.paddingRight);
    });
    expect(text).toBeLessThanOrEqual(clear.x + 1);
  });

  test("the chip clears the label (groups)", async ({ page }) => {
    const input = await groupsField(page);
    await input.click();
    await visible(page.getByRole("option")).first().click();
    await page.keyboard.press("Escape");
    const chip = await box(page.locator(".MuiAutocomplete-tag").first());
    const label = await box(
      page.locator("label", { hasText: "Groups" }).first(),
    );
    expect(chip.y).toBeGreaterThanOrEqual(label.y + label.height - 1);
    const clear = await box(
      visible(page.getByRole("button", { name: "Clear" })).first(),
    );
    const text = await input.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.right;
    });
    expect(text).toBeLessThanOrEqual(clear.x + 1);
  });
});
