import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow } from "../support/fixture";

// The photo row on a phone. Fixture 9863 has two photos. Read-only.

test.describe("gallery swipe", () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(
      info.project.name.startsWith("desktop"),
      "the row is the phone's",
    );
    await page.goto("/materials/9863");
    await expect(page.getByTestId("material-gallery")).toBeVisible();
  });

  test("the photos form a snapping row with the next one peeking @small", async ({
    page,
  }) => {
    const row = page.getByTestId("material-gallery");
    const style = await row.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        snap: cs.scrollSnapType,
        overflow: cs.overflowX,
        scrolls: el.scrollWidth > el.clientWidth,
      };
    });
    expect(style.snap).toContain("x mandatory");
    expect(style.overflow).toBe("auto");
    expect(style.scrolls).toBe(true);
    const vp = page.viewportSize();
    const second = await page
      .getByTestId("material-photo")
      .nth(1)
      .boundingBox();
    expect(second && vp && second.x < vp.width - 8).toBe(true);
    await expectNoHorizontalOverflow(page);
  });

  test("the position follows a scroll", async ({ page }) => {
    const position = page.getByTestId("gallery-position");
    await expect(position).toHaveText("1 of 2");
    await page
      .getByTestId("material-gallery")
      .evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
    await expect(position).toHaveText("2 of 2");
  });

  test("a photo opens the viewer at its index", async ({ page }) => {
    await page
      .getByRole("button", { name: /View photo 2 of 2/ })
      .click({ force: true });
    await expect(page.getByTestId("photo-viewer-position")).toHaveText(
      "2 of 2",
    );
  });

  test("no sideways page scroll at 130% text @small", async ({ page }) => {
    await page.addStyleTag({ content: "html{font-size:130% !important}" });
    await expectNoHorizontalOverflow(page);
  });
});
