import { expect, type Page, test } from "@playwright/test";
import {
  expectNoHorizontalOverflow,
  expectTouchTargets,
} from "../support/fixture";

// The photo viewer on the model page. Fixture 9863 (Vanishco Ghost) has two
// photos; their files are not on disk, so the viewer shows its fallback, which
// is all these tests need. Read-only.

const viewer = (page: Page) =>
  page.getByRole("dialog", { name: "Photo viewer" });
const position = (page: Page) => page.getByTestId("photo-viewer-position");

async function openFirst(page: Page) {
  await page.goto("/materials/9863");
  const first = page.getByRole("button", { name: /View photo 1 of 2/ });
  await first.click();
  await expect(viewer(page)).toBeVisible();
  return first;
}

test.describe("photo viewer", () => {
  test("a click opens the photo with its credit and position @small", async ({
    page,
  }) => {
    await openFirst(page);
    await expect(position(page)).toHaveText("1 of 2");
    await expect(
      viewer(page).getByRole("link", { name: /Photo: / }),
    ).toHaveAttribute("href", /^https?:/);
    for (const name of ["Close", "Previous photo", "Next photo"]) {
      await expectTouchTargets(viewer(page).getByRole("button", { name }));
    }
    const box = await page.getByTestId("photo-viewer-stage").boundingBox();
    const vp = page.viewportSize();
    expect(box && vp && box.width <= vp.width).toBe(true);
    await expectNoHorizontalOverflow(page);
  });

  test("next and previous by button and arrow key, wrapping", async ({
    page,
  }) => {
    await openFirst(page);
    await viewer(page).getByRole("button", { name: "Next photo" }).click();
    await expect(position(page)).toHaveText("2 of 2");
    await viewer(page).getByRole("button", { name: "Previous photo" }).click();
    await expect(position(page)).toHaveText("1 of 2");
    await page.keyboard.press("ArrowLeft");
    await expect(position(page)).toHaveText("2 of 2");
    await page.keyboard.press("ArrowRight");
    await expect(position(page)).toHaveText("1 of 2");
  });

  test("Escape closes it and focus returns to the photo @small", async ({
    page,
  }) => {
    const trigger = await openFirst(page);
    await page.keyboard.press("Escape");
    await expect(viewer(page)).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("the close button closes it", async ({ page }) => {
    const trigger = await openFirst(page);
    await viewer(page).getByRole("button", { name: "Close" }).click();
    await expect(viewer(page)).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("a list card opens the model, not the viewer", async ({ page }) => {
    await page.goto("/materials?q=Vanishco");
    await page
      .getByTestId("material-row")
      .filter({ visible: true })
      .first()
      .click();
    await expect(viewer(page)).toHaveCount(0);
  });
});
