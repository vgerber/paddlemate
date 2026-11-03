import { expect, test } from "@playwright/test";

// Signs in with its own browser context: ending the Keycloak session must not
// touch the shared session in e2e/.auth that the other specs reuse.
test("sign out ends the identity session and clears stored sign-in", async ({
  browser,
  baseURL,
  viewport,
}) => {
  test.skip(
    (viewport?.width ?? 0) < 768,
    "the Sign in button is in the desktop top bar",
  );
  const origin = new URL(baseURL ?? "").origin;
  const context = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  const signInLink = () =>
    page
      .locator("button:visible, a:visible")
      .filter({ hasText: /sign in/i })
      .first();

  await page.goto("/settings?group=account");
  await signInLink().click();
  await page.waitForURL((url) => url.pathname.includes("/realms/"));
  await page.locator("#username").fill(process.env.KC_USER ?? "vincent");
  await page.locator("#password").fill(process.env.KC_PASS ?? "paddle");
  await page.locator("#kc-login").click();
  await page.waitForURL(
    (url) =>
      url.origin === origin && !url.pathname.startsWith("/auth/callback"),
  );

  await page.goto("/settings?group=account");
  await page.getByRole("button", { name: "Sign out" }).click();

  // Back on the app, signed out, with no stored user.
  await page.waitForURL((url) => url.origin === origin);
  await expect(signInLink()).toBeVisible();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).some((k) => k.startsWith("oidc.user:")),
    ),
  ).toBe(false);

  // The SSO cookie is gone: Sign in asks for credentials again.
  await signInLink().click();
  await page.waitForURL((url) => url.pathname.includes("/realms/"));
  await expect(page.locator("#username")).toBeVisible();
  await context.close();
});
