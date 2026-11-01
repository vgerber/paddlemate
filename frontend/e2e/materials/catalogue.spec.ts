import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import {
  computed,
  expectNoHorizontalOverflow,
  expectTouchTargets,
} from "../support/fixture";

// The catalogue fields of the material wiki. Fixture entries: 9861 Photocraft
// Lens (a photo, colours, an approximate year, sources), 9862 Photocraft
// Blade (a paddle), 9863 Vanishco Ghost (two photos whose files are not on
// disk, for the takedown tests, which put the rows back). The photo of 9861
// is served from the API's MEDIA_DIR: see .claude/skills/test-data/SKILL.md.

// The API the stack under test talks to.
const ENTRY = `${process.env.E2E_API_URL ?? "http://localhost:3000"}/api/v1/materials/9862`;

const IMPERIAL = { weight: "lb", distance: "mi", length: "in" };

function psql(sql: string) {
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "paddlemate-db-1",
      "psql",
      "-U",
      "postgres",
      "-d",
      "paddlemate",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql },
  );
}

const restoreVanishco = () =>
  psql(`UPDATE material_images SET status = 'fetched',
          file = 'vanishco-ghost-' || (id - 9871) || '.jpg'
        WHERE id IN (9872, 9873)`);

const photos = (page: Page) => page.getByTestId("material-photo");

async function open(page: Page, id: number) {
  await page.goto(`/materials/${id}`);
  await expect(page.getByRole("heading").first()).toBeVisible();
}

test.describe("catalogue detail", () => {
  test("a kayak shows its photo, credit, colours and approximate year @small", async ({
    page,
  }) => {
    await open(page, 9861);
    const photo = photos(page).first();
    const image = photo.getByRole("img", { name: "Photocraft Lens" });
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);
    expect(await image.getAttribute("loading")).toBe("lazy");
    const credit = photo.getByRole("link", { name: /Photo: Photocraft/ });
    await expect(credit).toHaveAttribute("href", "https://example.com/lens");
    await expectTouchTargets(credit);

    const colors = page.getByTestId("material-colors");
    await expect(colors).toContainText("Lava Red");
    await expect(colors).toContainText("Glacier Blue");
    await expect(page.getByText("about 2021").first()).toBeVisible();
    await expect(page.getByText("Year from an archive capture.")).toBeVisible();

    const source = page.getByRole("link", {
      name: /example\.com - length, weight/,
    });
    await expect(source).toHaveAttribute(
      "href",
      "https://example.com/lens-specs",
    );
    await expectNoHorizontalOverflow(page);
    const box = await photo.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
  });

  test("a paddle states its specs, in the chosen units @small", async ({
    page,
  }) => {
    await open(page, 9862);
    const facts = page.getByTestId("paddle-facts");
    await expect(facts).toContainText("Blade area");
    await expect(facts).toContainText("645 cm²");
    await expect(facts).toContainText("191, 194, 197 cm");
    await expect(facts).toContainText("Bent");
    await expect(facts).toContainText("Carbon");
    await expect(facts).toContainText("0, 30, 45°");
    await expect(facts).toContainText("29.5 mm");
    await expect(facts).toContainText("860 g");
    await expect(page.getByText("Hull", { exact: true })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test("the paddle specs follow the length unit", async ({ page }) => {
    await page.addInitScript((units) => {
      localStorage.setItem("pm-units", JSON.stringify(units));
    }, IMPERIAL);
    await open(page, 9862);
    const facts = page.getByTestId("paddle-facts");
    await expect(facts).toContainText("100 in²");
    await expect(facts).toContainText("75.2, 76.4, 77.6 in");
    await expect(facts).toContainText("30.3 oz");
    await expect(facts).not.toContainText("645 cm");
  });

  test("the list shows a thumbnail and offers paddles", async ({ page }) => {
    await page.goto("/materials?q=Photocraft");
    const lens = page
      .getByTestId("material-row")
      .filter({ hasText: "Photocraft Lens" })
      .filter({ visible: true });
    const thumb = lens.getByTestId("material-thumb");
    await expect(thumb.locator("img")).toHaveAttribute("loading", "lazy");
    const size = await thumb.boundingBox();
    expect(size?.width).toBe(56);
    await expect(
      page
        .getByTestId("material-row")
        .filter({ hasText: "Photocraft Blade" })
        .filter({ visible: true }),
    ).toContainText("Length 191, 194, 197 cm");

    await page.goto("/materials?category=paddle");
    await expect(page.getByTestId("material-row").first()).toBeVisible();
    await page.getByTestId("filters-chip").click();
    const sheet = page.getByRole("dialog", { name: "Filters" });
    await expect(sheet.getByRole("button", { name: "Paddle" })).toBeVisible();
    for (const discipline of ["Freestyle", "Other"]) {
      await expect(
        sheet.getByRole("button", { name: discipline }),
      ).toBeVisible();
    }
    // Paddles offer paddle disciplines only.
    for (const discipline of ["Crossover", "Playboat"]) {
      await expect(sheet.getByRole("button", { name: discipline })).toHaveCount(
        0,
      );
    }
  });

  test("the entry form keeps every field of a paddle it did not change @write", async ({
    page,
  }) => {
    await open(page, 9862);
    const before = await (await page.request.get(ENTRY)).json();
    await page.getByRole("button", { name: "Entry actions" }).click();
    await page.getByRole("menuitem", { name: "Edit entry" }).click();
    await expect(page.getByLabel("Colours")).toHaveValue("Black");
    await page.getByRole("button", { name: "Save entry" }).click();
    await expect(page.getByTestId("paddle-facts")).toBeVisible();
    const after = await (await page.request.get(ENTRY)).json();
    const { updated_at: _a, updated_by_username: _b, ...kept } = after;
    const { updated_at: _c, updated_by_username: _d, ...was } = before;
    expect(kept).toEqual(was);
    // Put the entry back as it was seeded (an edit marks it as user-edited).
    psql("UPDATE materials SET updated_by = NULL WHERE id = 9862");
  });
});

test.describe("photo takedown", () => {
  test.afterEach(restoreVanishco);

  test("an admin removes one photo after confirming @write", async ({
    page,
  }) => {
    await open(page, 9863);
    await expect(photos(page)).toHaveCount(2);
    await page.getByRole("button", { name: "Entry actions" }).click();
    await page.getByRole("menuitem", { name: "Remove photo 1" }).click();
    const dialog = page.getByRole("dialog", { name: "Remove this photo?" });
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(photos(page)).toHaveCount(2);

    await page.getByRole("button", { name: "Entry actions" }).click();
    await page.getByRole("menuitem", { name: "Remove photo 1" }).click();
    await dialog.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(photos(page)).toHaveCount(1);
  });

  test("an admin removes every photo of a brand @write", async ({ page }) => {
    await open(page, 9863);
    await page.getByRole("button", { name: "Entry actions" }).click();
    await page
      .getByRole("menuitem", { name: "Remove all Vanishco photos" })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Remove all Vanishco photos?",
    });
    await dialog.getByRole("button", { name: "Remove all" }).click();
    await expect(photos(page)).toHaveCount(0);
    await expect(page.getByTestId("material-gallery")).toHaveCount(0);
  });

  test.describe("a paddler who is not an admin", () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        for (const key of Object.keys(localStorage)) {
          if (!key.startsWith("oidc.user:")) continue;
          const user = JSON.parse(localStorage.getItem(key) ?? "{}");
          user.profile.realm_access = { roles: [] };
          localStorage.setItem(key, JSON.stringify(user));
        }
      });
    });

    test("sees no way to remove a photo", async ({ page }) => {
      await open(page, 9863);
      await expect(photos(page)).toHaveCount(2);
      await page.getByRole("button", { name: "Entry actions" }).click();
      await expect(
        page.getByRole("menuitem", { name: "Edit entry" }),
      ).toBeVisible();
      await expect(page.getByRole("menuitem", { name: /Remove/ })).toHaveCount(
        0,
      );
      // Deleting stays open: a paddler's delete is sent for review.
      await expect(
        page.getByRole("menuitem", { name: "Delete entry" }),
      ).toBeVisible();
    });
  });
});

test("a photo box keeps its shape before the file arrives", async ({
  page,
}) => {
  await page.route("**/media/**", (route) => route.abort());
  await open(page, 9861);
  const box = await photos(page).first().boundingBox();
  expect(box).not.toBeNull();
  const ratio = await computed(
    photos(page).first().locator("div").first(),
    "aspect-ratio",
  );
  expect(ratio).toBe("4 / 3");
});
