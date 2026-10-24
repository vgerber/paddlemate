import { expect, type Page, test } from "@playwright/test";
import { parseColour } from "../support/colour";
import { contrastReport, lightSurfaces, useScheme } from "../support/dark";
import { FIX } from "../support/fixture";

// Every trip screen in dark: no light surface, text and control borders clear
// their ratios (doc/plans/dark-mode.md, Phase 2, D4).

const TRIP = FIX.trips[0];

// Findings that are not this screen's to fix, with their owner.
const KNOWN = [
  // The current day's number sits on a sliding disc that is a sibling
  // element, so the scan measures it against the card; the real pair is
  // onPrimary on primary.
  /^text div.* "\d+" 1\.0/,
  // MapLibre's own zoom control.
  /^border button\.maplibregl-ctrl/,
  // LogSectionRow renders levelConfig for light only (descents folder).
  /^text span.* "\d+ cm" /,
];

const tab = (name: string) => async (page: Page) => {
  const t = page.getByRole("tab", { name, exact: true });
  await t.click();
  await expect(t).toHaveAttribute("aria-selected", "true");
};

const screens: {
  name: string;
  path: string;
  ready: string | RegExp;
  open?: (page: Page) => Promise<void>;
}[] = [
  { name: "list", ready: "Oetztal week", path: "/trips" },
  { name: "plan", ready: "Oetztal week", path: `/trips/${TRIP}?edit=false` },
  {
    name: "bases",
    ready: "Oetztal week",
    path: `/trips/${TRIP}?edit=false`,
    open: tab("Bases"),
  },
  {
    name: "members",
    ready: "Oetztal week",
    path: `/trips/${TRIP}?edit=false`,
    open: tab("Members"),
  },
  {
    name: "logs",
    ready: "Oetztal week",
    path: `/trips/${TRIP}?edit=false`,
    open: tab("Logs"),
  },
  {
    name: "plan-a-day",
    ready: "Oetztal week",
    path: `/trips/${TRIP}?edit=false`,
    open: async (page) => {
      await page.getByRole("button", { name: "Plan a day" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
    },
  },
  {
    name: "add-base",
    ready: "Oetztal week",
    path: `/trips/${TRIP}?edit=false`,
    open: async (page) => {
      await tab("Bases")(page);
      await page.getByRole("button", { name: "Add base" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
    },
  },
  {
    name: "add-member",
    ready: "Oetztal week",
    path: `/trips/${TRIP}?edit=false`,
    open: async (page) => {
      await tab("Members")(page);
      await page.getByRole("button", { name: "Add member" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
    },
  },
  { name: "new", ready: /Create|New trip|Name/i, path: "/trips/new" },
  {
    name: "invite",
    ready: /invite|sign in|expired/i,
    path: "/invite/not-a-real-token",
  },
];

for (const screen of screens) {
  test(`trips in dark: ${screen.name} @small`, async ({ page }) => {
    const project = test.info().project.name;
    test.skip(
      project === "desktop" && !!screen.open,
      "tabs are a phone layout; desktop shows the cards",
    );
    await useScheme(page, "system", "dark");
    await page.goto(screen.path);
    await expect(page.getByText(screen.ready).first()).toBeVisible();
    await screen.open?.(page);
    await page.waitForTimeout(600);
    // The BottomSheet scrim is onSurface at 60%, light in dark
    // (components/BottomSheet.tsx, the shell's).
    const light = (await lightSurfaces(page)).filter(
      (l) => !l.detail.includes("rgba(232, 238, 240, 0.6)"),
    );
    // The current day's number sits on a sliding disc that is a sibling
    // element, so the scan measures it against the card (1.0x); the real pair
    // is onPrimary on primary.
    const contrast = (await contrastReport(page)).filter(
      (c) => !KNOWN.some((re) => re.test(`${c.what} ${c.detail}`)),
    );
    if (process.env.DARK_REPORT) {
      console.log(
        `REPORT ${project} ${screen.name}`,
        JSON.stringify({ light, contrast }),
      );
      await page.screenshot({
        path: `${process.env.DARK_REPORT}/${screen.name}-${project}.png`,
      });
    }
    expect(light, "light surfaces").toEqual([]);
    expect(contrast, "contrast").toEqual([]);
  });
}

test("the month scrim darkens the page under it in dark", async ({ page }) => {
  test.skip(
    test.info().project.name === "desktop",
    "the month is a phone view",
  );
  await useScheme(page, "dark");
  await page.goto(`/trips/${TRIP}?edit=false`);
  await page.getByRole("button", { name: "Show the month" }).click();
  const scrim = page.getByTestId("month-scrim").filter({ visible: true });
  await expect(scrim).toBeVisible();
  const [r, g, b, a] = parseColour(
    await scrim.evaluate((el) => getComputedStyle(el).backgroundColor),
  );
  expect(Math.max(r, g, b)).toBeLessThan(10);
  expect(a).toBeGreaterThanOrEqual(0.4);
});
