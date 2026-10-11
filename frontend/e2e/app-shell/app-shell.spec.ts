import { expect, test } from "@playwright/test";
import {
  appReady,
  computed,
  expectNoHorizontalOverflow,
} from "../support/fixture";

test("the app loads signed in, with the map and no console errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (
      m.type() === "error" &&
      !/favicon|tiles\.openfreemap|Failed to load resource/.test(m.text())
    )
      errors.push(m.text());
  });
  await page.goto("/");
  await appReady(page);
  expect(errors).toEqual([]);
});

test("the shell never scrolls sideways, on the map or in tools @small", async ({
  page,
}) => {
  for (const path of ["/", "/tools"]) {
    await page.goto(path);
    await page.waitForLoadState("load");
    await expectNoHorizontalOverflow(page);
  }
});

test("no navigation text is set in capitals", async ({ page }) => {
  await page.goto("/tools");
  const links = page.locator(
    "header a:visible, nav[aria-label=Main] a:visible",
  );
  await expect(links.first()).toBeVisible();
  for (const link of await links.all()) {
    expect(await computed(link, "text-transform")).toBe("none");
    expect(await computed(link, "letter-spacing")).toBe("normal");
  }
});
