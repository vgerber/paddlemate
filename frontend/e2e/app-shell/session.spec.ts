import { expect, type Page, test } from "@playwright/test";
import { appReady } from "../support/fixture";

// The PWA keeps its session through a phone's sleep: a renewal that fails
// for want of a network keeps the stored user and retries when the device is
// back online; only the identity server saying the refresh token is dead
// signs out.

const TOKEN = "**/protocol/openid-connect/token";

test.skip(({ isMobile }) => isMobile, "the account name shows in the app bar");

/** Marks the stored access token expired, as after a long sleep. */
async function expireStoredToken(page: Page) {
  await page.addInitScript(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith("oidc.user:")) continue;
      const user = JSON.parse(localStorage.getItem(key) ?? "{}");
      user.expires_at = Math.floor(Date.now() / 1000) - 60;
      localStorage.setItem(key, JSON.stringify(user));
    }
  }, undefined);
}

const storedUser = (page: Page) =>
  page.evaluate(() =>
    Object.keys(localStorage).some((k) => k.startsWith("oidc.user:")),
  );

test("a renewal without a network keeps the session and resumes online", async ({
  page,
}) => {
  await expireStoredToken(page);
  await page.route(TOKEN, (route) => route.abort("internetdisconnected"));
  await page.goto("/trips");
  await appReady(page).catch(() => {});
  await page.waitForTimeout(1500);
  expect(await storedUser(page)).toBe(true);

  await page.unroute(TOKEN);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("button", { name: /vincent/i })).toBeVisible();
});

test("a dead refresh token signs out", async ({ page }) => {
  await expireStoredToken(page);
  await page.route(TOKEN, (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "invalid_grant" }),
    }),
  );
  await page.goto("/trips");
  await expect(
    page.getByRole("button", { name: "Sign in" }).first(),
  ).toBeVisible();
  expect(await storedUser(page)).toBe(false);
});
