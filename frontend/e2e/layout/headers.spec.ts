import { expect, type Page, test } from "@playwright/test";
import { computed, gotoSection } from "../support/fixture";

// Header unification: section headings are 13/600/18 and card titles 15/600/20
// wherever they appear.

const SECTION = { size: "13px", weight: "600", line: "18px" };
const CARD = { size: "15px", weight: "600", line: "20px" };

async function expectType(
  page: Page,
  name: string,
  want: typeof SECTION,
  tag?: string,
) {
  const el = page
    .locator("p, h2, h3")
    .getByText(name, { exact: true })
    .filter({ visible: true })
    .first();
  await expect(el).toBeVisible();
  expect(await computed(el, "font-size"), `${name} size`).toBe(want.size);
  expect(await computed(el, "font-weight"), `${name} weight`).toBe(want.weight);
  expect(await computed(el, "line-height"), `${name} line`).toBe(want.line);
  if (tag) expect(await el.evaluate((n) => n.tagName)).toBe(tag);
}

test.describe("content headings: provenance and proposals", () => {
  test("Sources and All edits are card titles", async ({ page }) => {
    await gotoSection(page, "lower");
    await page.getByRole("tab", { name: "Sources", exact: true }).click();
    await expectType(page, "Sources", CARD);
    await expectType(page, "All edits", CARD);
  });

  test("proposal detail headings are section headings", async ({ page }) => {
    await page.goto("/proposals/9701");
    await expectType(page, "Features", SECTION, "H2");
  });
});
