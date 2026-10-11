import { expect, test } from "@playwright/test";
import { appReady } from "../support/fixture";

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
