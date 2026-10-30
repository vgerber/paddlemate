import { expect, type Page, test } from "@playwright/test";
import { mockRegions } from "../map/regions.mock";
import {
  appReady,
  expectNoHorizontalOverflow,
  expectTouchTargets,
} from "../support/fixture";

// Area search lists what lies in the circle nearest first, with the distance
// from the centre in the device's units; the centre can start at the device
// position and be set from the keyboard. The fixture river runs NE from
// (11.0, 47.0) to (11.07, 47.07); a centre at its far end puts the sections in
// the reverse of their id order, so the sort is not the database's order.

const FAR_END = "mode=area&lat=47.07&lon=11.07&radius=20";
const UNITS_KEY = "pm-units";

const rows = (page: Page) =>
  page.getByTestId("search-section-row").filter({ visible: true });
const button = (page: Page, name: string) =>
  page.getByRole("button", { name }).filter({ visible: true });

/** Opens area search; on a phone the results sit behind the peek sheet, so
 * pull it up first. */
async function openArea(page: Page, query: string) {
  await mockRegions(page);
  await page.goto(`/?${query}`);
  await appReady(page);
}

async function showResults(page: Page) {
  if ((await rows(page).count()) > 0) return;
  const handle = page.getByRole("region", { name: "Search" });
  const box = await handle.boundingBox();
  if (!box) throw new Error("no sheet");
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 400, { steps: 8 });
  await page.mouse.up();
  await expect(rows(page).first()).toBeVisible();
}

async function distances(page: Page) {
  const texts = await rows(page)
    .getByTestId("section-distance")
    .allTextContents();
  return texts.map((t) => ({
    value: Number.parseFloat(t),
    unit: t.split(" ")[1],
  }));
}

test.describe("results by distance", () => {
  test("rows run nearest first and show the distance in km", async ({
    page,
  }) => {
    await openArea(page, FAR_END);
    await showResults(page);
    await expect(rows(page).first()).toContainText("Silent Gauge Test");
    const found = await distances(page);
    expect(found.length).toBeGreaterThan(3);
    expect(found.every((d) => d.unit === "km")).toBe(true);
    const values = found.map((d) => d.value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(values[0]).toBeLessThan(values[values.length - 1]);
  });

  test("the distance follows the chosen units", async ({ page }) => {
    await openArea(page, FAR_END);
    await page.evaluate(
      (key) =>
        localStorage.setItem(
          key,
          JSON.stringify({ weight: "lb", distance: "mi", length: "in" }),
        ),
      UNITS_KEY,
    );
    await page.reload();
    await appReady(page);
    await showResults(page);
    const found = await distances(page);
    expect(found.length).toBeGreaterThan(3);
    expect(found.every((d) => d.unit === "mi")).toBe(true);
    await page.evaluate(
      (key) =>
        localStorage.setItem(
          key,
          JSON.stringify({ weight: "kg", distance: "km", length: "cm" }),
        ),
      UNITS_KEY,
    );
  });
});

test.describe("starting at the device position", () => {
  test("nothing is asked until Use my location is tapped", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __geoCalls: number };
      w.__geoCalls = 0;
      const real = navigator.geolocation.getCurrentPosition.bind(
        navigator.geolocation,
      );
      navigator.geolocation.getCurrentPosition = (...args) => {
        w.__geoCalls += 1;
        return real(...args);
      };
    });
    await openArea(page, "mode=area");
    await expect(button(page, "Use my location")).toBeVisible();
    const calls = () =>
      page.evaluate(
        () => (window as unknown as { __geoCalls: number }).__geoCalls,
      );
    expect(await calls()).toBe(0);
    await button(page, "Use my location").click();
    await expect.poll(calls).toBe(1);
  });

  test("granted: the circle moves to the device", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 47.07, longitude: 11.07 });
    await openArea(page, "mode=area&lat=47&lon=11&radius=20");
    await button(page, "Use my location").click();
    await expect(page).toHaveURL(/lat=47\.07&lon=11\.07/);
    await showResults(page);
    await expect(rows(page).first()).toContainText("Silent Gauge Test");
  });

  test("denied: a message says why and the circle stays", async ({
    page,
    context,
  }) => {
    await context.clearPermissions();
    await openArea(page, "mode=area&lat=47&lon=11&radius=20");
    await button(page, "Use my location").click();
    const error = page.getByTestId("location-error").filter({ visible: true });
    await expect(error).toContainText("Location access is blocked");
    await expect(page).toHaveURL(/lat=47&lon=11&radius=20/);
  });

  test("unavailable: a message says so", async ({ page }) => {
    await page.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (_ok, fail) =>
        fail?.({ code: 2, message: "", PERMISSION_DENIED: 1 } as never);
    });
    await openArea(page, "mode=area&lat=47&lon=11&radius=20");
    await button(page, "Use my location").click();
    await expect(
      page.getByTestId("location-error").filter({ visible: true }),
    ).toContainText("not available");
    await expect(page).toHaveURL(/lat=47&lon=11&radius=20/);
  });
});

test.describe("setting the centre from the keyboard", () => {
  test("Set centre here uses the middle of the map and says so", async ({
    page,
  }) => {
    await openArea(page, "mode=area&lat=47&lon=11&radius=20");
    await page.waitForFunction(
      () =>
        !!(window as unknown as { __paddlemateMap?: object }).__paddlemateMap,
    );
    await page.evaluate(() => {
      (
        window as unknown as {
          __paddlemateMap: { jumpTo(o: object): void };
        }
      ).__paddlemateMap.jumpTo({ center: [11.5, 47.5], zoom: 9 });
    });
    await expect(button(page, "Set centre here")).toBeEnabled();
    await button(page, "Set centre here").focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/lon=11\.[45]/);
    await expect(page.getByTestId("chart-live-region")).toContainText(
      "Search centre set to",
    );
  });

  test("arrow keys pan the focused map and Enter drops the centre", async ({
    page,
  }) => {
    await openArea(page, "mode=area&lat=47&lon=11&radius=20");
    await page.waitForFunction(() => {
      const map = (
        window as unknown as {
          __paddlemateMap?: { loaded(): boolean; isMoving(): boolean };
        }
      ).__paddlemateMap;
      return !!map && map.loaded() && !map.isMoving();
    });
    const canvas = page.locator("canvas.maplibregl-canvas");
    await canvas.focus();
    const lonBefore = Number(new URL(page.url()).searchParams.get("lon"));
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => {
      const map = (
        window as unknown as { __paddlemateMap?: { isMoving(): boolean } }
      ).__paddlemateMap;
      return !!map && !map.isMoving();
    });
    await page.keyboard.press("Enter");
    await expect
      .poll(() => Number(new URL(page.url()).searchParams.get("lon")))
      .toBeGreaterThan(lonBefore + 0.001);
    await expect(page.getByTestId("chart-live-region")).toContainText(
      "Search centre set to",
    );
  });

  test("@small the actions fit: 44px targets, no sideways scroll", async ({
    page,
  }) => {
    await openArea(page, "mode=area&lat=47&lon=11&radius=20");
    await expectTouchTargets(button(page, "Use my location"));
    await expectTouchTargets(button(page, "Set centre here"));
    await expectNoHorizontalOverflow(page);
  });
});
