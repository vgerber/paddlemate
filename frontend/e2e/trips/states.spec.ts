import { expect, type Page, test } from "@playwright/test";
import { seen } from "../support/active";
import { FIX } from "../support/fixture";

// Failed and empty loads on trips, the inbox, tools and search: each says what
// happened (the server's message, never "empty") and offers Retry.

const TRIP = FIX.trips[0];
const FAILURE = {
  status: 500,
  contentType: "application/json",
  body: JSON.stringify({
    error: { code: "internal", message: "Hiccup (test)", target: null },
  }),
};
const api = (path: string) => new RegExp(`/api/v1${path}`);

async function failGet(page: Page, re: RegExp) {
  await page.route(re, (route) =>
    route.request().method() === "GET"
      ? route.fulfill(FAILURE)
      : route.continue(),
  );
}

const errorNote = (page: Page) => seen(page.getByTestId("error-state"));

test.describe("trips, failed loads", () => {
  test("the trip list says it failed instead of 'No trips yet'", async ({
    page,
  }) => {
    await failGet(page, api("/trips(\\?.*)?$"));
    await page.goto("/trips");
    await expect(errorNote(page)).toContainText("Hiccup (test)");
    await expect(page.getByText("No trips yet.")).toHaveCount(0);
  });

  for (const [tab, path] of [
    ["Bases", "/trips/\\d+/stays"],
    ["Members", "/trips/\\d+/members"],
    ["Logs", "/descents"],
  ] as const) {
    test(`${tab} says it failed, not that it is empty`, async ({ page }) => {
      test.skip(test.info().project.name === "desktop", "phone route");
      await failGet(page, api(path));
      await page.goto(`/trips/${TRIP}?edit=false`);
      await page.getByRole("tab", { name: tab }).click();
      await expect(errorNote(page)).toContainText("Hiccup (test)");
      await expect(page.getByText(/^No (bases|members|logs)/)).toHaveCount(0);
    });
  }

  test("the plan says it failed when the stays do", async ({ page }) => {
    test.skip(test.info().project.name === "desktop", "phone route");
    await failGet(page, api("/trips/\\d+/stays"));
    await page.goto(`/trips/${TRIP}?edit=false`);
    await expect(errorNote(page)).toContainText("Hiccup (test)");
  });

  test("days before the start read Before, not Day -1", async ({ page }) => {
    test.skip(test.info().project.name === "desktop", "phone route");
    await page.goto(`/trips/${TRIP}?edit=false`);
    await expect(page.getByTestId("plan-day").first()).toBeVisible();
    await expect(page.getByText(/Day -\d/)).toHaveCount(0);
  });

  test("the desktop pane shows a spinner, then the error, for the open trip", async ({
    page,
  }) => {
    test.skip(test.info().project.name !== "desktop", "desktop pane");
    await failGet(page, api(`/trips/${TRIP}$`));
    await page.goto(`/trips?selected=${TRIP}`);
    await expect(page.getByTestId("trip-panel")).toBeVisible();
    await expect(errorNote(page)).toContainText("Hiccup (test)");
  });
});

test.describe("inbox, tools and search states", () => {
  test("the inbox says it failed instead of 'Nothing new'", async ({
    page,
  }) => {
    test.skip(test.info().project.name === "desktop", "phone tab");
    await failGet(page, api("/users/me/notifications"));
    await page.goto("/settings");
    await page.getByRole("tab", { name: "Inbox" }).click();
    await expect(errorNote(page)).toContainText("Hiccup (test)");
    await expect(page.getByText("Nothing new")).toHaveCount(0);
  });

  test("zero counts drop out of the tool cards", async ({ page }) => {
    await page.route(api("/waterways/gauges/map"), (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      }),
    );
    await page.goto("/tools");
    await expect(page.getByText("Gauge coverage")).toBeVisible();
    await expect(page.getByText(/^0$/)).toHaveCount(0);
  });

  test("a failed name search shows only the error, no tabs", async ({
    page,
  }) => {
    test.skip(test.info().project.name === "desktop", "phone search sheet");
    await failGet(page, api("/waterways(\\?.*)?$"));
    await page.goto("/");
    await page.getByLabel("Open search panel").click();
    await page.locator("input:visible").first().fill("inn");
    await expect(errorNote(page)).toContainText("Hiccup (test)");
    await expect(page.getByRole("tab", { name: /^Sections/ })).toHaveCount(0);
  });
});
