import { expect, type Page, test } from "@playwright/test";
import { appReady } from "../support/fixture";

const KEY = "pm-motion";

const attr = (page: Page) =>
  page.evaluate(() => document.documentElement.getAttribute("data-motion"));
const choice = (page: Page, name: string) =>
  page
    .getByTestId("settings-detail")
    .getByRole("group", { name: "Motion" })
    .getByRole("button", { name, exact: true });
const longest = async (page: Page) => {
  await expect(page.locator("button:visible").first()).toBeVisible();
  return page.evaluate(() =>
    Math.max(
      0,
      ...[...document.querySelectorAll("button")].flatMap((b) =>
        getComputedStyle(b)
          .transitionDuration.split(",")
          .map((d) => Number.parseFloat(d)),
      ),
    ),
  );
};

async function open(page: Page) {
  await page.goto("/settings?group=appearance");
  await expect(choice(page, "System")).toBeVisible();
}

test.describe("motion setting", () => {
  test("System is the default and follows the device live", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await open(page);
    await expect(choice(page, "System")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(await attr(page)).toBe("full");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect.poll(() => attr(page)).toBe("reduced");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect.poll(() => attr(page)).toBe("full");
  });

  test("the choice applies at once and survives a reload", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await open(page);
    await choice(page, "Reduced").click();
    await expect.poll(() => attr(page)).toBe("reduced");
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(
      "reduced",
    );
    await page.reload();
    await expect(choice(page, "Reduced")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await choice(page, "System").click();
    await expect.poll(() => attr(page)).toBe("full");
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
  });

  test("the attribute is set before the bundle runs", async ({ page }) => {
    await page.addInitScript((k) => {
      localStorage.setItem(k, "reduced");
      // Runs at the first script of the document, before index.html's own.
      // Record what the page script set by the time the module bundle loads.
      document.addEventListener("DOMContentLoaded", () => {
        (window as unknown as { __early: string | null }).__early =
          document.documentElement.getAttribute("data-motion");
      });
    }, KEY);
    await page.goto("/");
    const early = await page.evaluate(
      () => (window as unknown as { __early: string | null }).__early,
    );
    expect(early).toBe("reduced");
  });

  test("Reduced collapses transitions, Full beats a device that reduces", async ({
    page,
  }) => {
    await page.addInitScript((k) => {
      if (!localStorage.getItem(k)) localStorage.setItem(k, "reduced");
    }, KEY);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await appReady(page);
    expect(await longest(page)).toBeLessThanOrEqual(0.001);

    await page.evaluate((k) => localStorage.setItem(k, "full"), KEY);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await appReady(page);
    expect(await attr(page)).toBe("full");
    expect(await longest(page)).toBeGreaterThan(0.05);
  });
});
