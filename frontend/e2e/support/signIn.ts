import { expect, type Page } from "@playwright/test";

/** The API the app under test talks to; the config's default is :3000. */
export const API = process.env.E2E_API_URL ?? "http://localhost:3000";

/** Signs in through the real Keycloak flow as one of the fixture paddlers
 * (password "paddle"), in a page that holds no session yet. The suite's
 * stored session is the admin; this is how a spec acts as somebody else. */
export async function signInAs(page: Page, username: string) {
  // The sign-in card of a screen that needs an account is on every layout.
  await page.goto("/logs");
  await page
    .getByTestId("state-card")
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await page.waitForURL((url) => url.pathname.includes("/realms/"));
  expect(
    new URL(page.url()).host,
    "sign-in must go to the local Keycloak",
  ).toBe("localhost:8080");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill("paddle");
  await page.locator("#kc-login").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth/callback"), {
    timeout: 20_000,
  });
  await page.evaluate(() =>
    localStorage.setItem(
      "pm-units",
      JSON.stringify({ weight: "kg", distance: "km", length: "cm" }),
    ),
  );
}

/** The access token the signed-in page holds, for calling the API directly. */
export async function bearer(page: Page): Promise<{ Authorization: string }> {
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) =>
      k.startsWith("oidc.user:"),
    );
    return key
      ? JSON.parse(localStorage.getItem(key) ?? "{}").access_token
      : "";
  });
  return { Authorization: `Bearer ${token}` };
}
