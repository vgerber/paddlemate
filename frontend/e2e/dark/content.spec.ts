import { expect, type Page, test } from "@playwright/test";
import { mockRegions } from "../map/regions.mock";
import { contrastReport, lightSurfaces, useScheme } from "../support/dark";

// The content screens in dark: search and its modes, filters, proposals, the
// log form and detail, provenance, inbox (doc/design.md#dark-mode).

const SCREENS: {
  name: string;
  path: string;
  ready: RegExp;
  open?: (page: Page) => Promise<void>;
}[] = [
  { name: "search-name", path: "/?panel=1&q=Test", ready: /Test/ },
  { name: "search-area", path: "/?panel=1&mode=area", ready: /Area/ },
  { name: "search-region", path: "/?panel=1&mode=region", ready: /Region/ },
  {
    name: "filters-sheet",
    path: "/?panel=1&q=Test",
    ready: /Test/,
    open: async (page) => {
      await page.getByRole("button", { name: /Grade/ }).first().click();
      await expect(page.getByLabel("Filters").first()).toBeVisible();
    },
  },
  {
    name: "proposals",
    path: "/proposals?status=pending",
    ready: /Mittelschwall/,
  },
  { name: "proposal", path: "/proposals/9701", ready: /Mittelschwall/ },
  { name: "admin-proposals", path: "/admin/proposals", ready: /\w/ },
  { name: "logs", path: "/logs", ready: /Test/ },
  { name: "log-detail", path: "/logs/9201", ready: /Test/ },
  { name: "log-form", path: "/logs/new", ready: /Log descent/ },
  {
    name: "section-sources",
    path: "/?waterway=9001&section=9102",
    ready: /Lower Test/,
    open: async (page) => {
      await page.getByRole("tab", { name: "Sources", exact: true }).click();
    },
  },
  {
    name: "inbox",
    path: "/settings?group=notifications",
    ready: /Notification/i,
  },
];

const OTHERS = [
  // The rejected fold (ButtonBase) draws a dimmed separator rule on purpose.
  /^border button.* "(Hide|Show) rejected/,
  // The switch thumb is a dimmed light token (switchThumb) on the track.
  /^span\.MuiSwitch-thumb/,
];
const ours = (r: { what: string }) => !OTHERS.some((re) => re.test(r.what));

test.describe("content screens in dark @small", () => {
  for (const s of SCREENS) {
    test(s.name, async ({ page }) => {
      await useScheme(page, "system", "dark");
      await mockRegions(page);
      await page.goto(s.path);
      await expect(page.locator("body")).toContainText(s.ready);
      await s.open?.(page);
      await page.waitForTimeout(1000);
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      expect((await lightSurfaces(page)).filter(ours)).toEqual([]);
      expect((await contrastReport(page)).filter(ours)).toEqual([]);
      const over = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(over, "sideways scroll").toBeLessThanOrEqual(0);
    });
  }

  test("an unset filter chip is a raised pill, a set one has the teal ring", async ({
    page,
  }) => {
    await useScheme(page, "system", "dark");
    await page.goto("/?panel=1&q=Test");
    const chip = page.getByRole("button", { name: /Grade/ }).first();
    await expect(chip).toBeVisible();
    const unset = await chip.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        border: s.borderTopColor,
        bg: s.backgroundColor,
        shadow: s.boxShadow,
      };
    });
    expect(unset.border, "no border").toBe("rgba(0, 0, 0, 0)");
    expect(unset.bg, "surface fill").not.toBe("rgba(0, 0, 0, 0)");
    expect(unset.shadow, "e1 shadow").not.toBe("none");

    await page.goto("/?panel=1&q=Test&country=AT");
    const set = page.getByRole("button", { name: /^AT/ }).first();
    await expect(set).toBeVisible();
    const ring = await set.evaluate((el) => {
      const s = getComputedStyle(el);
      return { width: s.borderTopWidth, colour: s.borderTopColor };
    });
    expect(ring.width, "ring width").toBe("1px");
    expect(ring.colour, "teal ring").not.toBe(unset.border);
    expect(ring.colour, "teal ring").not.toBe("rgba(0, 0, 0, 0)");
  });
});
