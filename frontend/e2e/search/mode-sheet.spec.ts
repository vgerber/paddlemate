import { expect, type Page, test } from "@playwright/test";
import { mockRegions } from "../map/regions.mock";
import { appReady } from "../support/fixture";

// Area and region are searched by looking at the map. On a phone the search
// rests over the map as a peek sheet; Name keeps the full-screen overlay. The
// desktop card holds the same controls and the circle is drawn at once.

const sheet = (page: Page) => page.getByTestId("mode-sheet");
const overlay = (page: Page) => page.getByTestId("mobile-overlay");
const tab = (page: Page, name: string) =>
  page.getByRole("tab", { name, exact: true }).filter({ visible: true });

async function open(page: Page, query: string) {
  await mockRegions(page);
  await page.goto(`/?${query}`);
  await appReady(page);
  await expect(tab(page, "Name")).toBeVisible();
}

test.describe("area and region on a phone", () => {
  test.skip(({ isMobile }) => !isMobile, "the peek sheet is the phone's");

  test("@small switching to Area leaves most of the screen to the map", async ({
    page,
  }) => {
    await open(page, "panel=1");
    await expect(overlay(page)).toBeVisible();
    await tab(page, "Area").click();
    await expect(page).toHaveURL(/mode=area/);
    await expect(sheet(page)).toBeVisible();
    await expect(overlay(page)).not.toBeVisible();
    const box = await page
      .getByRole("region", { name: "Search" })
      .boundingBox();
    const height = page.viewportSize()?.height ?? 0;
    expect(box?.y ?? 0, "the sheet starts in the lower half").toBeGreaterThan(
      height * 0.45,
    );
    // The bottom navigation stays, the map is there to touch.
    await expect(page.getByRole("navigation")).toBeVisible();
    await expect(page.getByTestId("map-card")).toBeVisible();
  });

  test("@small the circle is drawn at once, with its radius and hint in the sheet", async ({
    page,
  }) => {
    await open(page, "mode=area");
    await expect(page).toHaveURL(/lat=.+&lon=.+&radius=10/);
    await expect(
      page.getByText("Tap the map to move the search center."),
    ).toBeVisible();
    await expect(page.getByRole("slider")).toBeVisible();
    await expect(page.getByText("10 km", { exact: true })).toBeVisible();
  });

  test("pulling the sheet up shows the results and Name brings the overlay back", async ({
    page,
  }) => {
    await open(page, "mode=area");
    const box = await page
      .getByRole("region", { name: "Search" })
      .boundingBox();
    if (!box) throw new Error("no sheet");
    await page.mouse.move(box.x + box.width / 2, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 400, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByRole("dialog", { name: "Search" })).toBeVisible();
    await page.getByTestId("sheet-scrim").click({ position: { x: 5, y: 5 } });
    await tab(page, "Name").click();
    await expect(page).not.toHaveURL(/mode=/);
    await expect(sheet(page)).toHaveCount(0);
    await expect(overlay(page)).toBeVisible();
  });

  test("Region shows the level chips and the way in through the map", async ({
    page,
  }) => {
    await open(page, "mode=region");
    await expect(sheet(page)).toBeVisible();
    await expect(
      page.getByText("Tap a state on the map, or search one by name."),
    ).toBeVisible();
    const valleys = page.getByRole("button", { name: "Valleys" }).first();
    await expect(valleys).toHaveAttribute("aria-pressed", "false");
    await valleys.click();
    await expect(valleys).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("area and region on a desktop", () => {
  test.skip(({ isMobile }) => isMobile, "the card is the desktop's");

  test("the card holds the controls and the circle is drawn at once", async ({
    page,
  }) => {
    await open(page, "mode=area");
    await expect(page).toHaveURL(/lat=.+&lon=.+&radius=10/);
    await expect(sheet(page)).toHaveCount(0);
    await expect(
      page.getByText("Click the map to move the search center."),
    ).toBeVisible();
    await expect(page.getByRole("slider")).toBeVisible();
    await expect(page.getByRole("button", { name: "Lock area" })).toBeVisible();
  });
});
