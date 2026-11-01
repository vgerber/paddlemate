import type { Page } from "@playwright/test";

/** Pick groups in the entry form's Groups field, in the order given. */
export async function pickGroups(page: Page, ...groups: string[]) {
  const field = page.getByRole("combobox", { name: /^Groups/ });
  for (const group of groups) {
    await field.click();
    await page.getByRole("option", { name: group, exact: true }).click();
  }
}
