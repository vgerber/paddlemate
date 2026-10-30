import { expect, type Page, test } from "@playwright/test";
import { Finger } from "../support/finger";
import {
  appReady,
  expectNoHorizontalOverflow,
  expectTouchTargets,
  FIX,
} from "../support/fixture";

// On a phone a feature opens in a sheet over the map: from a row of the
// section's list or from a tap on the map, the same peek card. Fixture: Lower
// Test (9102); its list order is put-in, Slot Machine (9524), Big Hole
// (9525), Altes Wehr (9526), strainer, portage, bridge, take-out.

test.use({ hasTouch: true });
test.skip(({ isMobile }) => !isMobile, "the sheet is the phone's");

const LOWER = `/?waterway=${FIX.waterway}&section=${FIX.sections.lower}`;
const HOLE = { id: 9525, at: [11.013, 47.013] as [number, number] };
const NOTE = "Scout from river left. The hole is sticky under 80 cm.";

type MapLike = {
  isMoving(): boolean;
  loaded(): boolean;
  project(lngLat: [number, number]): { x: number; y: number };
};

const sheet = (page: Page) => page.getByTestId("feature-sheet");
const feature = (page: Page) => new URL(page.url()).searchParams.get("feature");

/** The hole carries a note, so the peek has its key line. */
async function withNote(page: Page) {
  await page.route(`**/waterways/${FIX.waterway}`, async (route) => {
    // Node resolves localhost to ::1, where the API does not listen.
    const response = await route.fetch({
      url: route.request().url().replace("localhost", "127.0.0.1"),
    });
    const body = await response.json();
    for (const section of body.sections ?? []) {
      for (const f of section.features ?? []) {
        if (f.id === HOLE.id) {
          f.descriptions = [
            {
              id: 1,
              feature_id: f.id,
              lang_code: "en",
              description: NOTE,
            },
          ];
        }
      }
    }
    await route.fulfill({ response, json: body });
  });
}

async function open(page: Page) {
  await withNote(page);
  await page.goto(LOWER);
  await appReady(page);
  await expect(page.getByTestId("mobile-overlay")).toBeVisible();
}

const rowOf = (page: Page, name: string) =>
  page.locator("[data-row]").filter({ hasText: name });

/** A row tap: the list slides away and the sheet peeks over the map. */
async function pickRow(page: Page, name = "Big Hole") {
  await rowOf(page, name).tap();
  await expect(sheet(page)).toBeVisible();
  await expect(page.getByTestId("mobile-overlay")).toBeHidden();
  // The sheet and the map fly settle before a gesture lands on them.
  await settled(page);
}

async function settled(page: Page) {
  await page.waitForFunction(() => {
    const map = (window as unknown as { __paddlemateMap?: MapLike })
      .__paddlemateMap;
    return !!map && map.loaded() && !map.isMoving();
  });
  await page.waitForFunction(
    () => document.getElementById("root")?.getAnimations().length === 0,
  );
}

async function box(page: Page, id: string) {
  const b = await page.getByTestId(id).boundingBox();
  if (!b) throw new Error(`${id} is not on screen`);
  return b;
}

test.describe("opening a feature on a phone", () => {
  test("a row opens the sheet over the map, above the bottom nav", async ({
    page,
  }) => {
    await open(page);
    await rowOf(page, "Big Hole").tap();
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page)).toHaveAttribute("data-snap", "peek");
    expect(feature(page)).toBe(String(HOLE.id));
    // The list is gone, not expanded.
    await expect(page.getByTestId("mobile-overlay")).toBeHidden();
    await expect(sheet(page).getByRole("heading")).toContainText("Big Hole");
    await expect(page.getByTestId("feature-sheet-sub")).toHaveText(
      /^Hole · 0\.\d km · 3 of 8$/,
    );
    await expect(page.getByTestId("feature-sheet-key")).toHaveText(NOTE);
    // The nav stays reachable: the sheet ends where the nav begins.
    const nav = await page.getByRole("navigation").last().boundingBox();
    const s = await page.getByTestId("feature-sheet-head").boundingBox();
    if (!nav || !s) throw new Error("no nav or sheet");
    await settled(page);
    expect(s.y + s.height).toBeLessThanOrEqual(nav.y + 1);
    await expect(page.getByRole("link", { name: "Logs" })).toBeVisible();
  });

  test("a tap on the map opens the same sheet", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "View on map" }).tap();
    await settled(page);
    await page.evaluate((at) => {
      const map = (
        window as unknown as { __paddlemateMap: { jumpTo(o: object): void } }
      ).__paddlemateMap;
      map.jumpTo({ center: at, zoom: 17 });
    }, HOLE.at);
    await settled(page);
    const canvas = await page.locator("canvas.maplibregl-canvas").boundingBox();
    const p = await page.evaluate(
      (at) =>
        (
          window as unknown as { __paddlemateMap: MapLike }
        ).__paddlemateMap.project(at),
      HOLE.at,
    );
    if (!canvas) throw new Error("no canvas");
    await page.touchscreen.tap(canvas.x + p.x, canvas.y + p.y);
    await expect(sheet(page)).toBeVisible();
    expect(feature(page)).toBe(String(HOLE.id));
    await expect(sheet(page).getByRole("heading")).toContainText("Big Hole");
  });

  test("the feature stays in the map above the sheet, peek and half", async ({
    page,
  }) => {
    await open(page);
    await pickRow(page);
    for (const snap of ["peek", "half"] as const) {
      if (snap === "half") await page.getByLabel("Show more").tap();
      await expect(sheet(page)).toHaveAttribute("data-snap", snap);
      await settled(page);
      const canvas = await page
        .locator("canvas.maplibregl-canvas")
        .boundingBox();
      const s = await sheet(page).boundingBox();
      const p = await page.evaluate(
        (at) =>
          (
            window as unknown as { __paddlemateMap: MapLike }
          ).__paddlemateMap.project(at),
        HOLE.at,
      );
      if (!canvas || !s) throw new Error("no canvas or sheet");
      expect(
        canvas.y + p.y,
        `${snap}: the feature is above the sheet`,
      ).toBeLessThan(s.y + 1);
      expect(canvas.y + p.y).toBeGreaterThan(canvas.y);
    }
  });

  test("a drag moves between peek, half and closed", async ({ page }) => {
    await open(page);
    await pickRow(page);
    const head = await box(page, "feature-sheet-head");
    const x = head.x + head.width / 2;
    const y = head.y + 70;

    let finger = await Finger.down(page, x, y);
    await finger.moveBy(0, -160);
    await finger.up();
    await expect(sheet(page)).toHaveAttribute("data-snap", "half");

    const half = await box(page, "feature-sheet-head");
    finger = await Finger.down(page, half.x + 100, half.y + 70);
    await finger.moveBy(0, 260);
    await finger.up();
    await expect(sheet(page)).toHaveAttribute("data-snap", "peek");

    const peek = await box(page, "feature-sheet-head");
    finger = await Finger.down(page, peek.x + 100, peek.y + 70);
    await finger.moveBy(0, 120);
    await finger.up();
    await expect(sheet(page)).toBeHidden();
    // Closed: the feature stays selected and the bar names it.
    expect(feature(page)).toBe(String(HOLE.id));
    await expect(page.locator("[data-selection-bar]")).toContainText(
      "Big Hole",
    );
  });

  test("pulling past half goes back to the list with the row marked", async ({
    page,
  }) => {
    await open(page);
    await pickRow(page);
    await page.getByLabel("Show more").tap();
    await settled(page);
    const head = await box(page, "feature-sheet-head");
    const finger = await Finger.down(page, head.x + 100, head.y + 70);
    await finger.moveBy(0, -200);
    await finger.up();
    await expect(page.getByTestId("mobile-overlay")).toBeVisible();
    await expect(sheet(page)).toBeHidden();
    await expect(rowOf(page, "Big Hole")).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(rowOf(page, "Big Hole")).not.toHaveAttribute("aria-expanded");
    await expect(rowOf(page, "Big Hole")).toBeInViewport();
  });

  test("next and previous step along the list and keep the height", async ({
    page,
  }) => {
    await open(page);
    await pickRow(page, "Slot Machine");
    await page.getByLabel("Show more").tap();
    await expect(sheet(page)).toHaveAttribute("data-snap", "half");
    await page.getByRole("button", { name: "Next feature" }).tap();
    await expect(sheet(page).getByRole("heading")).toContainText("Big Hole");
    expect(feature(page)).toBe("9525");
    await expect(sheet(page)).toHaveAttribute("data-snap", "half");
    await expect(page.getByTestId("feature-sheet-sub")).toContainText("3 of 8");
    await page.getByRole("button", { name: "Previous feature" }).tap();
    await expect(sheet(page).getByRole("heading")).toContainText(
      "Slot Machine",
    );
    expect(feature(page)).toBe("9524");
  });

  test("the first and last feature have one way to step", async ({ page }) => {
    await open(page);
    await rowOf(page, "Put in").first().tap();
    await expect(sheet(page)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Previous feature" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Next feature" }),
    ).toBeEnabled();
  });

  test("a sideways swipe on the header steps to the next feature", async ({
    page,
  }) => {
    await open(page);
    await pickRow(page);
    const head = await box(page, "feature-sheet-head");
    const finger = await Finger.down(
      page,
      head.x + head.width / 2,
      head.y + 70,
    );
    await finger.moveBy(-120, 0);
    await finger.up();
    await expect(sheet(page).getByRole("heading")).toContainText("Altes Wehr");
    expect(feature(page)).toBe("9526");
  });

  test("the back arrow returns to the list, close keeps the selection", async ({
    page,
  }) => {
    await open(page);
    await pickRow(page);
    await page.getByRole("button", { name: "Close" }).tap();
    await expect(sheet(page)).toBeHidden();
    expect(feature(page)).toBe(String(HOLE.id));
    // The selection bar opens the list again; the feature is still marked.
    await page.locator("[data-selection-bar]").tap();
    await expect(page.getByTestId("mobile-overlay")).toBeVisible();
    await expect(rowOf(page, "Big Hole")).toHaveAttribute(
      "aria-current",
      "true",
    );
    // Picking it again re-opens the sheet.
    await rowOf(page, "Big Hole").tap();
    await expect(sheet(page)).toBeVisible();
    await page.getByRole("button", { name: "Back to the list" }).tap();
    await expect(page.getByTestId("mobile-overlay")).toBeVisible();
    await expect(sheet(page)).toBeHidden();
  });

  test("History in the sheet opens that feature's history in the list", async ({
    page,
  }) => {
    await open(page);
    await pickRow(page, "Altes Wehr");
    await page.getByLabel("Show more").tap();
    await page
      .getByTestId("feature-sheet")
      .getByRole("button", { name: "Feature actions", exact: true })
      .tap();
    await page.getByRole("menuitem", { name: "History" }).tap();
    await expect(page.getByTestId("mobile-overlay")).toBeVisible();
    await expect(page.getByTestId("history-step").first()).toBeVisible();
  });

  test("Escape closes the sheet and focus lands on the selection bar", async ({
    page,
  }) => {
    await open(page);
    await pickRow(page);
    await expect(sheet(page)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toBeHidden();
    await expect(page.locator("[data-selection-bar]")).toBeFocused();
  });

  test("the sheet moves by transform", async ({ page }) => {
    await open(page);
    await pickRow(page);
    await settled(page);
    const during = await sheet(page).evaluate(async (el) => {
      document.querySelector<HTMLElement>('[aria-label="Show more"]')?.click();
      await new Promise((r) => requestAnimationFrame(r));
      return {
        running: el.getAnimations().length,
        property: getComputedStyle(el).transitionProperty,
      };
    });
    expect(during.property).toBe("transform");
    expect(during.running).toBeGreaterThan(0);
  });

  test("with reduced motion the sheet does not animate", async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem("pm-motion", "reduced"),
    );
    await open(page);
    await pickRow(page);
    await page.getByLabel("Show more").tap();
    await expect(sheet(page)).toHaveAttribute("data-snap", "half");
    const duration = await sheet(page).evaluate((el) => el.style.transition);
    expect(duration).toBe("none");
  });

  test("the controls are 44px and the page does not scroll sideways", async ({
    page,
  }) => {
    await open(page);
    await pickRow(page);
    await expectTouchTargets(
      page.locator(
        '[data-testid="feature-sheet"] button, [aria-label="Back to the list"], [aria-label="Close"]',
      ),
    );
    await expectNoHorizontalOverflow(page);
  });

  test("a small phone keeps the map: a short peek, no key line under 360px @small", async ({
    page,
  }) => {
    await open(page);
    await pickRow(page);
    const narrow = (page.viewportSize()?.width ?? 412) < 360;
    const key = page.getByTestId("feature-sheet-key");
    if (narrow) await expect(key).toBeHidden();
    else await expect(key).toBeVisible();
    const s = await sheet(page).boundingBox();
    const vh = page.viewportSize()?.height ?? 568;
    if (!s) throw new Error("no sheet");
    await settled(page);
    const head = await box(page, "feature-sheet-head");
    expect(head.height).toBeLessThanOrEqual(vh * 0.25);
    await expectNoHorizontalOverflow(page);
    await page.getByLabel("Show more").tap();
    await expect(sheet(page)).toHaveAttribute("data-snap", "half");
    await expectTouchTargets(
      page.locator('[data-testid="feature-sheet"] button'),
    );
    await expectNoHorizontalOverflow(page);
  });
});
