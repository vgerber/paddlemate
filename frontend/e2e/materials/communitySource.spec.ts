import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow } from "../support/fixture";

// The quiet line under the specs of a model whose values still rest on
// playak.com. Fixture 9861 (Photocraft Lens) is sourced from example.com;
// the Playak case is the same entry with its sources swapped in the response.

const NOTE =
  "Some specs come from a community source and are not confirmed by the maker.";

async function openWith(
  page: import("@playwright/test").Page,
  sources: Record<string, string> | null,
) {
  if (sources) {
    await page.route("**/api/v1/materials/9861", async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      await route.fulfill({ response: res, json: { ...body, sources } });
    });
  }
  await page.goto("/materials/9861");
  await expect(page.getByRole("heading").first()).toBeVisible();
}

test.describe("community source note", () => {
  test("shows for a value sourced on playak.com @small", async ({ page }) => {
    await openWith(page, {
      weight_kg: "https://www.example.com/lens",
      length_cm: "https://playak.com/buyers-guide/boats-boards/photocraft-lens",
    });
    const note = page.getByTestId("community-source-note");
    await expect(note).toHaveText(NOTE);
    await expectNoHorizontalOverflow(page);
  });

  test("stays away for a maker-sourced model @small", async ({ page }) => {
    await openWith(page, null);
    await expect(
      page.getByTestId("spec-cards").or(page.getByText("All sizes")),
    ).toBeVisible();
    await expect(page.getByTestId("community-source-note")).toHaveCount(0);
  });

  test("a look-alike host does not trigger it", async ({ page }) => {
    await openWith(page, { weight_kg: "https://notplayak.com/lens" });
    await expect(page.getByTestId("community-source-note")).toHaveCount(0);
  });
});
