import { expect, type Locator, type Page, test } from "@playwright/test";
import { mockRegions, SHARED_POINT, VIEW } from "../map/regions.mock";
import { appReady, FIX } from "../support/fixture";

// Search rows and the region tab: the kind pill, "Similar names", the
// region list heading, the "regions here" popup and the star beside a row.

/** The sidebar and the phone sheet both mount the panel; one is hidden. */
const seen = (l: Locator) =>
  l
    .filter({ visible: true })
    .locator("xpath=self::*[not(ancestor::*[@data-testid='swipe-ghost'])]");

async function openSearch(page: Page, query = "") {
  await page.goto(`/?panel=1${query}`);
  await appReady(page);
  await expect(
    page.getByRole("tab", { name: "Name", exact: true }).first(),
  ).toBeVisible();
}

const resultTab = (page: Page, name: string) =>
  seen(page.locator("button.MuiTab-root", { hasText: new RegExp(`^${name}`) }));

const typePill = (page: Page) =>
  seen(page.getByTestId("search-pane")).locator(".MuiChip-root", {
    hasText: /^(river|stream|canal)$/i,
  });

test.describe("the kind pill", () => {
  test("rivers of one kind carry no pill", async ({ page }) => {
    await openSearch(page, "&q=Test");
    await resultTab(page, "Rivers").click();
    await expect(
      seen(page.getByRole("button", { name: /Test River/ })).first(),
    ).toBeVisible();
    await expect(typePill(page)).toHaveCount(0);
  });

  test("a list that mixes kinds names each row's kind", async ({ page }) => {
    await page.route(/\/api\/v1\/waterways\?/, async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      const items = body.items;
      if (items?.[0]) items[0].waterway_type = "stream";
      await route.fulfill({ response: res, json: body });
    });
    await openSearch(page, "&q=Test");
    await resultTab(page, "Rivers").click();
    await expect(typePill(page).first()).toBeVisible();
    const labels = await typePill(page).allTextContents();
    expect(labels).toContain("stream");
    expect(labels).toContain("river");
  });
});

test.describe("similar names", () => {
  test("the heading belongs to Rivers, never to Sections", async ({ page }) => {
    await openSearch(page, "&q=Elba");
    await expect(resultTab(page, "Sections")).toBeVisible();
    await expect(page.getByText("Similar names")).toHaveCount(0);
    await resultTab(page, "Rivers").click();
    await expect(
      seen(page.getByRole("heading", { name: "Similar names" })),
    ).toBeVisible();
    await resultTab(page, "Sections").click();
    await expect(page.getByText("Similar names")).toHaveCount(0);
  });
});

test.describe("the region list", () => {
  test("a short list shows its rows and nothing is a heading over nothing", async ({
    page,
  }) => {
    await mockRegions(page);
    await openSearch(page, "&mode=region");
    await page.waitForFunction(() => window.__paddlemateMap?.loaded());
    await page.evaluate(
      ([center, zoom]) =>
        window.__paddlemateMap?.jumpTo({
          center: center as [number, number],
          zoom: zoom as number,
        }),
      [VIEW.center, VIEW.zoom],
    );
    await seen(
      page.getByRole("button", { name: "Ranges", exact: true }),
    ).click();
    const toggle = seen(page.getByTestId("region-list-toggle"));
    await expect(toggle).toBeVisible();
    // The toggle is a button, not a heading, and a short list is open.
    await expect(page.getByRole("heading", { name: /in view/ })).toHaveCount(0);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(
      await seen(page.getByTestId("region-list-row")).count(),
    ).toBeGreaterThan(0);
    await toggle.click();
    await expect(seen(page.getByTestId("region-list-row"))).toHaveCount(0);
  });
});

test.describe("the regions-here popup", () => {
  async function clickAt(page: Page, lngLat: [number, number]) {
    await expect
      .poll(() =>
        page.evaluate((p) => {
          const map = window.__paddlemateMap;
          const pt = map?.project(p);
          return pt
            ? (map?.queryRenderedFeatures(pt, {
                layers: ["region-browse-fill"],
              }).length ?? 0)
            : 0;
        }, lngLat),
      )
      .toBeGreaterThan(0);
    const at = await page.evaluate((p) => {
      const map = window.__paddlemateMap;
      const box = map?.getCanvas().getBoundingClientRect();
      const pt = map?.project(p);
      return {
        x: (box?.x ?? 0) + (pt?.x ?? 0),
        y: (box?.y ?? 0) + (pt?.y ?? 0),
      };
    }, lngLat);
    await page.mouse.click(at.x, at.y);
    return at;
  }

  async function openPopup(page: Page) {
    await mockRegions(page);
    await openSearch(page, "&mode=region");
    await page.waitForFunction(() => window.__paddlemateMap?.loaded());
    await page.evaluate(
      ([center, zoom]) =>
        window.__paddlemateMap?.jumpTo({
          center: center as [number, number],
          zoom: zoom as number,
        }),
      [VIEW.center, VIEW.zoom],
    );
    await seen(
      page.getByRole("button", { name: "Ranges", exact: true }),
    ).click();
    const at = await clickAt(page, SHARED_POINT);
    await expect(page.getByTestId("region-choices")).toBeVisible();
    return at;
  }

  test.beforeEach(({ isMobile }) => {
    test.skip(isMobile, "a phone previews first and has no choice card");
  });

  test("Escape closes it", async ({ page }) => {
    await openPopup(page);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("region-choices")).toHaveCount(0);
  });

  test("dragging the map closes it", async ({ page }) => {
    const at = await openPopup(page);
    await page.mouse.move(at.x + 200, at.y + 150);
    await page.mouse.down();
    await page.mouse.move(at.x + 260, at.y + 190, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByTestId("region-choices")).toHaveCount(0);
  });

  test("wheel zoom closes it", async ({ page }) => {
    const at = await openPopup(page);
    await page.mouse.move(at.x + 200, at.y + 150);
    await page.mouse.wheel(0, -300);
    await expect(page.getByTestId("region-choices")).toHaveCount(0);
  });

  test("another tab closes it", async ({ page }) => {
    await openPopup(page);
    await seen(page.getByRole("tab", { name: "Name", exact: true })).click();
    await expect(page.getByTestId("region-choices")).toHaveCount(0);
    await seen(page.getByRole("tab", { name: "Region", exact: true })).click();
    await expect(page.getByTestId("region-choices")).toHaveCount(0);
  });

  test("taking a row closes it", async ({ page }) => {
    await openPopup(page);
    await page.getByTestId("region-choices").getByRole("button").last().click();
    await expect(page.getByTestId("region-choices")).toHaveCount(0);
  });
});

test.describe("the star beside a row", () => {
  test("the star is the row's sibling, so no button holds a button", async ({
    page,
  }) => {
    await page.route(/\/favorites\/sections$/, (route) =>
      route.fulfill({
        json: [
          {
            id: FIX.sections.lower,
            name: "Lower Test",
            waterway_id: FIX.waterway,
            waterway_name: "Test River",
            regions: [],
            features: [],
            location: { type: "Point", coordinates: [10, 47] },
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ],
      }),
    );
    await openSearch(page);
    const row = seen(page.getByTestId("search-section-row")).first();
    await expect(row).toBeVisible();
    await expect(row.locator("button, [role=button]")).toHaveCount(0);
    const star = seen(
      page.getByRole("button", { name: "Remove from favorites" }),
    ).first();
    await expect(star).toBeVisible();
    expect(
      await star.evaluate(
        (el) => el.closest("[data-testid=search-section-row]") === null,
      ),
    ).toBe(true);
  });
});
