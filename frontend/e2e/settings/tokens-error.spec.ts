import { expect, test } from "@playwright/test";

test.describe("access tokens load failure", () => {
  test("a failed load shows the server message and Retry, not 'No tokens yet'", async ({
    page,
  }) => {
    let fail = true;
    await page.route("**/users/me/tokens", async (route) => {
      if (route.request().method() !== "GET" || !fail) return route.continue();
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "internal", message: "Tokens are down." },
        }),
      });
    });
    await page.goto("/settings?group=tokens");
    const state = page.getByTestId("error-state");
    await expect(state).toContainText("Tokens are down.");
    await expect(page.getByText("No tokens yet.")).toHaveCount(0);
    fail = false;
    await state.getByRole("button", { name: "Retry" }).click();
    await expect(state).toHaveCount(0);
  });
});
