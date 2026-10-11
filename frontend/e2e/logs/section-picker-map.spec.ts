import { expect, test } from "@playwright/test";
import { FIX } from "../support/fixture";

test("the section picker map of the log form has no layer chrome", async ({
  page,
}) => {
  await page.goto(
    `/logs/new?waterwayId=${FIX.waterway}&sectionId=${FIX.sections.upper}`,
  );
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Step 2 of 3 · Sections")).toBeVisible();
  // From md the form is in a canvas card, behind which the host map (with its
  // own layer chrome) draws; only the form's map is under test.
  const form = page.locator('main, [data-testid="canvas-card-log"]');
  await expect(form.locator("canvas.maplibregl-canvas")).toBeVisible();
  await expect(form.getByTestId("map-layer-toggle")).toHaveCount(0);
});
