import type { Page } from "@playwright/test";

/** Opens the "Feature actions" menu of a feature by its row text: in the open
 * row on a wide screen, in the feature sheet at half height on a phone. */
export async function openFeatureActions(page: Page, rowText: string) {
  const card = page.getByTestId("features-card").filter({ visible: true });
  await card.locator("[data-row]").filter({ hasText: rowText }).click();
  const sheet = page.getByTestId("feature-sheet");
  if (await sheet.isVisible()) {
    if ((await sheet.getAttribute("data-snap")) !== "half") {
      await page.getByLabel("Show more").click();
    }
    await sheet
      .getByRole("button", { name: "Feature actions", exact: true })
      .click();
    return;
  }
  await card
    .getByRole("button", { name: "Feature actions", exact: true })
    .first()
    .click();
}
