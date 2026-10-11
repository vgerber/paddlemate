import { expect, test as setup } from "@playwright/test";

// Signs in through the real Keycloak authorization-code + PKCE flow, as a
// user does: app -> "Sign in" -> Keycloak form -> callback -> app. Nothing is
// written to storage by hand, so ownership, roles and token refresh behave as
// they do in use. The session is saved once and reused by every project.
const USER = process.env.KC_USER ?? "vincent";
const PASS = process.env.KC_PASS ?? "paddle";

setup("sign in as the fixture admin", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/");
  await page
    .locator("button, a")
    .filter({ hasText: /sign in/i })
    .first()
    .click();

  // Credentials only ever go to the local identity server. A worktree without
  // frontend/.env.development.local falls back to the production one.
  await page.waitForURL(
    (url) =>
      url.pathname.includes("/realms/") || url.protocol === "chrome-error:",
  );
  const host = new URL(page.url()).host;
  expect(host, "sign-in must go to the local Keycloak").toBe("localhost:8080");

  await page.locator("#username").fill(USER);
  await page.locator("#password").fill(PASS);
  await page.locator("#kc-login").click();

  await page.waitForURL((url) => !url.pathname.startsWith("/auth/callback"), {
    timeout: 20_000,
  });
  const signedIn = await page.evaluate(() =>
    Object.keys(localStorage).some((k) => k.startsWith("oidc.user:")),
  );
  expect(signedIn, "the app holds an OIDC session").toBe(true);

  await page.context().storageState({ path: "e2e/.auth/vincent.json" });
});
