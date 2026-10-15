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
  // The form leaves the canvas, so its picker map is the only map.
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  await expect(page.locator(".maplibregl-map")).toHaveCount(1);
  await expect(page.getByTestId("canvas-host")).toHaveCount(0);
  await expect(page.getByTestId("map-layer-toggle")).toHaveCount(0);
});

test("on desktop the log form is a left pane with the map beside it", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "wide layout");
  await page.goto("/logs/new");
  await expect(page.getByText("Step 1 of 3 · When")).toBeVisible();
  await expect(page.locator(".maplibregl-map")).toHaveCount(1);
  const [map, cancel] = await Promise.all([
    page.locator(".maplibregl-map").boundingBox(),
    page.getByRole("button", { name: "Cancel" }).boundingBox(),
  ]);
  if (!map || !cancel) throw new Error("no boxes");
  expect(cancel.x).toBeLessThan(100);
  expect(map.x).toBeGreaterThan(400);
  expect(map.width).toBeGreaterThan(800);
});
