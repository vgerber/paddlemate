import { expect, test } from "@playwright/test";
import { useScheme } from "../support/dark";

// The bundle is a module and arrives late; the inline script and style in
// index.html must already have made the page dark.
test.describe("no flash @small", () => {
  test("a held bundle leaves a dark page before React mounts", async ({
    page,
  }) => {
    await useScheme(page, "system", "dark");
    await page.route(/\/src\/main\.tsx/, async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.continue();
    });
    await page.goto("/", { waitUntil: "commit" });
    await page.waitForTimeout(600);
    const early = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute("data-theme"),
      html: getComputedStyle(document.documentElement).backgroundColor,
      scheme: getComputedStyle(document.documentElement).colorScheme,
      mounted: document.getElementById("root")?.childElementCount ?? 0,
    }));
    expect(early.mounted, "React has not mounted yet").toBe(0);
    expect(early.theme).toBe("dark");
    expect(early.html).toBe("rgb(20, 27, 31)");
    expect(early.scheme).toBe("dark");
  });
});
