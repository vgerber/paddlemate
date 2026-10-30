import { expect, type Page, test } from "@playwright/test";
import { FIX } from "../support/fixture";
import { mixedInbox } from "../support/notifications";

// Trip details that reach outside the trip card: the map framing what is
// open, the bell opening the Bases tab, and the Members role pills.

const TRIP = FIX.trips[0];
const isDesktop = () => test.info().project.name.startsWith("desktop");

interface CameraHook {
  getBounds(): {
    getWest(): number;
    getEast(): number;
    getSouth(): number;
    getNorth(): number;
  };
  getZoom(): number;
  isMoving(): boolean;
  loaded(): boolean;
  once(event: "moveend", fn: () => void): void;
}
type CameraWindow = { __paddlemateMap?: CameraHook };

const view = (page: Page) =>
  page.evaluate(() => {
    const map = (window as unknown as CameraWindow).__paddlemateMap;
    if (!map) return null;
    const b = map.getBounds();
    return {
      zoom: map.getZoom(),
      west: b.getWest(),
      east: b.getEast(),
      south: b.getSouth(),
      north: b.getNorth(),
    };
  });

async function settled(page: Page) {
  await page.waitForFunction(() =>
    (window as unknown as CameraWindow).__paddlemateMap?.loaded(),
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const map = (window as unknown as CameraWindow).__paddlemateMap;
        if (!map?.isMoving()) return resolve();
        map.once("moveend", () => resolve());
      }),
  );
}

test.describe("trip map framing", () => {
  test("an open candidate is framed on the canvas map", async ({ page }) => {
    test.skip(!isDesktop(), "the canvas is the desktop map");
    await page.goto(`/trips?selected=${TRIP}`);
    await page.getByRole("tab", { name: "Bases", exact: true }).click();
    await settled(page);
    const row = page
      .getByTestId("candidate-row")
      .filter({ hasText: "Haus Wildspitze" });
    await row
      .getByRole("button", { name: /Haus Wildspitze/ })
      .first()
      .click();
    await expect
      .poll(async () => {
        const v = await view(page);
        return v ? v.zoom : 0;
      })
      .toBeGreaterThanOrEqual(11);
    await settled(page);
    const v = await view(page);
    // Haus Wildspitze sits at 10.928, 47.149.
    expect(v?.west).toBeLessThan(10.928);
    expect(v?.east).toBeGreaterThan(10.928);
    expect(v?.south).toBeLessThan(47.149);
    expect(v?.north).toBeGreaterThan(47.149);
    // Closing it frames the whole trip again.
    await row
      .getByRole("button", { name: /Haus Wildspitze/ })
      .first()
      .click();
    await expect
      .poll(async () => (await view(page))?.zoom ?? 99)
      .toBeLessThan(11);
  });

  test("an open day frames its base", async ({ page }) => {
    test.skip(!isDesktop(), "the canvas is the desktop map");
    await page.goto(`/trips?selected=${TRIP}`);
    await settled(page);
    const whole = await view(page);
    const days = page.getByTestId("plan-day").filter({ visible: true });
    await expect(days.first()).toBeVisible();
    const n = await days.count();
    let tighter = false;
    for (let i = 0; i < n && !tighter; i++) {
      await days.nth(i).getByRole("button").first().click();
      await settled(page);
      const v = await view(page);
      tighter = (v?.zoom ?? 0) > (whole?.zoom ?? 0) + 0.3;
    }
    expect(tighter).toBe(true);
  });
});

test.describe("trip events in the bell", () => {
  test("a base event opens the trip on its Bases tab", async ({ page }) => {
    await mixedInbox(page);
    if (isDesktop()) {
      await page.goto("/trips");
      await page.getByRole("button", { name: /notifications/i }).click();
    } else {
      await page.goto("/settings");
      await page.getByRole("tab", { name: "Inbox" }).click();
    }
    await page
      .locator(".MuiListItemButton-root")
      .filter({ hasText: "Camp 1" })
      .first()
      .click();
    await expect(page).toHaveURL(/tab=bases/);
    await expect(
      page.getByRole("tab", { name: "Bases", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
  });

  test("the tab is in the address and survives a reload", async ({ page }) => {
    await page.goto(`/trips/${TRIP}`);
    await page.getByRole("tab", { name: "Bases", exact: true }).click();
    await expect(page).toHaveURL(/tab=bases/);
    await page.reload();
    await expect(
      page.getByRole("tab", { name: "Bases", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("members role pills", () => {
  test("Admin and Member pills share one width", async ({ page }) => {
    await page.goto(`/trips/${TRIP}?tab=members`);
    const pills = page.getByTestId("member-role").filter({ visible: true });
    await expect(pills.first()).toBeVisible();
    const texts = await pills.allTextContents();
    expect(new Set(texts).size).toBeGreaterThan(1);
    const widths = await pills.evaluateAll((els) =>
      els.map((e) => Math.round(e.getBoundingClientRect().width)),
    );
    expect(new Set(widths).size).toBe(1);
  });
});
