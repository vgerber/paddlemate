import { expect, test } from "@playwright/test";
import { computed, expectNoHorizontalOverflow } from "../support/fixture";

test.describe("sign-in callback", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a failed sign-in is a calm card with one way out @small", async ({
    page,
  }) => {
    await page.goto("/auth/callback?error=access_denied&state=x");
    await expect(page.getByText("Sign-in failed")).toBeVisible();
    await expect(page.getByTestId("state-card")).toBeVisible();
    const home = page.getByRole("button", { name: "Go home" });
    await expect(home).toBeVisible();
    expect(await computed(home, "text-transform")).toBe("none");
    expect(await computed(home, "background-color")).toBe("rgb(14, 116, 144)");
    expect((await home.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page);
  });
});
