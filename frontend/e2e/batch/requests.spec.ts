import { expect, type Page, test } from "@playwright/test";
import { FIX, gotoSection } from "../support/fixture";

// Screens that show many rivers, sections or features ask once, not once per
// row: the trip page's rivers and water levels, and a section's edit history.

/** The API calls a page makes while `act` runs, as "METHOD path". */
async function apiCalls(page: Page, act: () => Promise<void>) {
  const calls: string[] = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.pathname.startsWith("/api/v1/waterways"))
      calls.push(`${url.pathname}${url.search}`);
  });
  await act();
  // Late requests land after the rows draw.
  await page.waitForTimeout(1500);
  console.log(
    `${test.info().project.name}: ${calls.length} waterway requests\n  ${calls.join("\n  ")}`,
  );
  return calls;
}

const single = {
  river: /^\/api\/v1\/waterways\/\d+\??$/,
  status: /\/sections\/\d+\/water-status/,
  history: /\/history/,
};

test("the trip page loads its rivers and levels in batches", async ({
  page,
}) => {
  const calls = await apiCalls(page, async () => {
    await page.goto(`/trips/${FIX.trips[0]}`);
    await page.getByRole("tab", { name: "Bases", exact: true }).click();
    await expect(
      page.getByTestId("stay-row").filter({ visible: true }).first(),
    ).toBeVisible();
  });
  expect(calls.filter((c) => single.river.test(c))).toHaveLength(0);
  expect(calls.filter((c) => single.status.test(c))).toHaveLength(0);
  expect(
    calls.filter((c) => c.includes("ids=") || c.includes("section_ids")).length,
  ).toBeLessThanOrEqual(2);
});

test("a section's Notes tab loads no history per feature", async ({ page }) => {
  await gotoSection(page, "lower");
  const calls = await apiCalls(page, async () => {
    await page.getByRole("tab", { name: "Sources", exact: true }).click();
    await expect(page.getByTestId("history").first()).toBeVisible();
  });
  const histories = calls.filter((c) => single.history.test(c));
  expect(histories.length).toBeLessThanOrEqual(1);
  expect(histories.filter((c) => c.includes("/features/"))).toHaveLength(0);
});
