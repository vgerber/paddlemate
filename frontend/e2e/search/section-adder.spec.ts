import { expect, test } from "@playwright/test";

// The river and section pickers of the log form's second step.

test("a picked section leaves the picker empty and the field says river", async ({
  page,
}) => {
  await page.goto(`/logs/new`);
  await expect(page.getByText("Step 1 of 3 · When")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByLabel("Search river")).toBeVisible();
  await expect(page.getByLabel("Search waterway")).toHaveCount(0);
  await page.getByLabel("Search river").fill("Test River");
  await page.getByRole("option", { name: "Test River" }).first().click();
  const add = page.getByLabel("Add section");
  await add.click();
  await page.getByRole("option").first().click();
  await expect(add).toHaveValue("");
});
