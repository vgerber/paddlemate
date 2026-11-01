import { expect, type Page, test } from "@playwright/test";
import {
  expectNoHorizontalOverflow,
  expectTouchTargets,
} from "../support/fixture";

// The model card of the desktop grid and the row of the phone list: one
// structure for every model, photo or none. Read-only; the list is the
// seeded creek kayaks, a mix of models with and without a photo.

const rows = (page: Page) =>
  page.getByTestId("material-row").filter({ visible: true });

async function openCreek(page: Page) {
  await page.goto("/materials?category=kayak&discipline=creek");
  await expect(rows(page).first()).toBeVisible();
}

test.describe("model cards", () => {
  test("every photo box is the same size, with or without a photo @small", async ({
    page,
  }) => {
    await openCreek(page);
    const boxes = await rows(page)
      .getByTestId("material-thumb")
      .evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return `${Math.round(r.width)}x${Math.round(r.height)}`;
        }),
      );
    expect(boxes.length).toBeGreaterThan(5);
    const heights = new Set(boxes.map((box) => box.split("x")[1]));
    expect([...heights]).toHaveLength(1);
    const withPhoto = await rows(page).locator("img").count();
    const without = boxes.length - withPhoto;
    expect(withPhoto).toBeGreaterThan(0);
    expect(without).toBeGreaterThan(0);
    await expectNoHorizontalOverflow(page);
  });

  test("cards of a grid row are as tall as each other, with specs on one line", async ({
    page,
  }, info) => {
    test.skip(info.project.name.startsWith("phone"), "grid is desktop only");
    test.skip(info.project.name.startsWith("small"), "grid is desktop only");
    await openCreek(page);
    const boxes = await rows(page).evaluateAll((els) =>
      els.slice(0, 8).map((el) => {
        const r = el.getBoundingClientRect();
        const spec = el.querySelector("dl")?.getBoundingClientRect();
        return {
          top: Math.round(r.top),
          h: Math.round(r.height),
          spec: spec ? Math.round(spec.top - r.top) : -1,
        };
      }),
    );
    const first = boxes.filter((box) => box.top === boxes[0].top);
    expect(first.length).toBeGreaterThan(1);
    for (const box of first) {
      expect(box.h).toBe(first[0].h);
      expect(box.spec).toBe(first[0].spec);
    }
  });

  test("the compare box is reachable by keyboard and 44px @small", async ({
    page,
  }) => {
    await openCreek(page);
    const box = rows(page).first().getByRole("checkbox");
    await box.focus();
    await expect(box).toBeFocused();
    const shell = rows(page).first().locator(".compare-box");
    await expect(shell).toHaveCSS("opacity", "1");
    await expectTouchTargets(shell);
  });

  test("a name and a brand read as one phrase", async ({ page }) => {
    await openCreek(page);
    await expect(rows(page).filter({ hasText: "Dagger Code" })).toHaveCount(1);
  });
});
