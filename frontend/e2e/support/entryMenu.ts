import type { Page } from "@playwright/test";

/** Opens the header menu of a wiki entry's page. */
export async function openEntryMenu(page: Page) {
  await page.getByRole("button", { name: "Entry actions" }).click();
}

/** Opens the entry menu and picks one action by its label. */
export async function pickEntryAction(page: Page, name: string | RegExp) {
  await openEntryMenu(page);
  await page.getByRole("menuitem", { name }).click();
}
