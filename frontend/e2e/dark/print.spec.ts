import { expect, test } from "@playwright/test";
import { useScheme } from "../support/dark";
import { appReady } from "../support/fixture";

// Paper is always light: printing in dark gives a white page and dark text,
// html included (index.html), or the margin below the body prints dark.
test.describe("print in dark @small", () => {
  test("the page and its ground are white, the text dark", async ({ page }) => {
    await useScheme(page, "dark");
    await page.goto("/");
    await appReady(page);
    await page.emulateMedia({ colorScheme: "dark", media: "print" });
    const look = await page.evaluate(() => ({
      html: getComputedStyle(document.documentElement).backgroundColor,
      body: getComputedStyle(document.body).backgroundColor,
      text: getComputedStyle(document.body).color,
      scheme: getComputedStyle(document.documentElement).colorScheme,
    }));
    expect(look.html).toBe("rgb(255, 255, 255)");
    expect(look.body).toBe("rgb(255, 255, 255)");
    expect(look.text).toBe("rgb(31, 43, 49)");
    expect(look.scheme).toBe("light");
  });
});
