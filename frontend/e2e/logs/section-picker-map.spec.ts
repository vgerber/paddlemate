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
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  await expect(page.getByTestId("map-layer-toggle")).toHaveCount(0);
});
