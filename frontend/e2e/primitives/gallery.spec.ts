import { expect, type Page, test } from "@playwright/test";
import { Finger } from "../support/finger";
import { expectTouchTargets } from "../support/fixture";

// The shared pieces nothing else mounts yet, driven through the dev-only
// gallery at /dev/primitives (served by the dev server, not production).

test.use({ hasTouch: true });

const PEEK = 120;

async function openGallery(page: Page) {
  await page.goto("/dev/primitives");
  await expect(page.getByRole("button", { name: "Open sheet" })).toBeVisible();
}

const sheet = (page: Page) => page.getByLabel("Gallery sheet");

/** Top of the sheet in px from the top of the viewport, once it stops moving. */
async function sheetTop(page: Page) {
  let last = Number.NaN;
  await expect
    .poll(async () => {
      const box = await sheet(page).boundingBox();
      const top = box?.y ?? Number.NaN;
      const still = top === last;
      last = top;
      return still;
    })
    .toBe(true);
  return last;
}

async function openToPeek(page: Page) {
  await openGallery(page);
  await page.getByRole("button", { name: "Open sheet" }).click();
  await expect(sheet(page)).toBeVisible();
}

async function dragOpen(page: Page) {
  const box = await sheet(page).boundingBox();
  if (!box) throw new Error("no sheet box");
  const f = await Finger.down(page, box.x + box.width / 2, box.y + 22);
  await f.moveBy(0, -300);
  await f.up();
  await expect(sheet(page)).toHaveAttribute("role", "dialog");
}

test.describe("bottom sheet", () => {
  test("opens to the peek height", async ({ page }) => {
    await openToPeek(page);
    await expect(sheet(page)).toHaveAttribute("role", "region");
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("no viewport");
    expect(await sheetTop(page)).toBeCloseTo(viewport.height - PEEK, -1);
    await expect(page.getByTestId("sheet-scrim")).toHaveCount(0);
  });

  test("a real touch drag on the handle opens it", async ({ page }) => {
    await openToPeek(page);
    const peekTop = await sheetTop(page);
    await dragOpen(page);
    expect(await sheetTop(page)).toBeLessThan(peekTop - 100);
    await expect(page.getByTestId("sheet-scrim")).toBeVisible();
  });

  test("traps focus while open", async ({ page }) => {
    await openToPeek(page);
    await dragOpen(page);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(
        () =>
          document
            .querySelector("[aria-label='Gallery sheet']")
            ?.contains(document.activeElement) ?? false,
      );
      expect(inside, `focus inside the sheet after Tab ${i + 1}`).toBe(true);
    }
  });

  test("Escape closes it only while open", async ({ page }) => {
    await openToPeek(page);
    // Even with focus on the sheet, a peeking sheet ignores Escape.
    await sheet(page).focus();
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toHaveAttribute("role", "region");
    await dragOpen(page);
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toHaveCount(0);
  });

  test("focus returns to the opener on close", async ({ page }) => {
    await openToPeek(page);
    await dragOpen(page);
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Open sheet" }),
    ).toBeFocused();
  });
});

test.describe("chip row", () => {
  test("@small chips are 32px to look at and 44px to hit", async ({ page }) => {
    await openGallery(page);
    const chips = page.getByTestId("chip-row").locator(".MuiChip-root");
    const look = await chips.evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect().height),
    );
    expect(look.length).toBeGreaterThan(5);
    for (const h of look) expect(h).toBe(32);
    // The hit area is the chip's ::after; expectTouchTargets measures
    // elements, so it gets a probe the size of that area.
    const hit = await chips.evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        const after = getComputedStyle(e, "::after");
        return {
          label: e.textContent,
          w: r.width + Number.parseFloat(after.left) * -2,
          h: r.height + Number.parseFloat(after.top) * -2,
        };
      }),
    );
    for (const c of hit)
      expect(c.h, `${c.label} hit height`).toBeGreaterThanOrEqual(44);
    await expectTouchTargets(chips, 32);
    // A tap 6px above the chip still lands on it.
    const first = await chips.first().boundingBox();
    if (!first) throw new Error("no chip box");
    const top = await page.evaluate(
      ([x, y]) =>
        document.elementFromPoint(x, y)?.closest(".MuiChip-root")?.textContent,
      [first.x + first.width / 2, first.y - 5],
    );
    expect(top).toBe("Whitewater");
  });

  test("@small the row scrolls sideways and fades where it continues", async ({
    page,
  }, info) => {
    test.skip(
      info.project.name !== "small",
      "the chips only overflow at 320px",
    );
    await openGallery(page);
    const row = page.getByTestId("chip-row").locator("> div");
    const metrics = () =>
      row.evaluate((el) => ({
        left: el.scrollLeft,
        max: el.scrollWidth - el.clientWidth,
        mask: getComputedStyle(el).maskImage,
      }));
    const start = await metrics();
    expect(start.max, "chips overflow the row").toBeGreaterThan(100);
    // At the start only the end fades.
    expect(start.mask).toMatch(/^linear-gradient\(to right, rgb\(0, 0, 0\)/);
    expect(start.mask).toMatch(/rgba\(0, 0, 0, 0\)\)$/);

    const box = await row.boundingBox();
    if (!box) throw new Error("no row box");
    const f = await Finger.down(page, box.x + box.width * 0.8, box.y + 20);
    await f.moveBy(-150, 0, 10, 16);
    await f.up();
    await expect.poll(async () => (await metrics()).left).toBeGreaterThan(20);

    await row.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
    await expect
      .poll(async () => (await metrics()).mask)
      .toMatch(
        /^linear-gradient\(to right, rgba\(0, 0, 0, 0\).*rgb\(0, 0, 0\)\)$/,
      );
  });
});

test.describe("feature type icons", () => {
  for (const size of [16, 24]) {
    test(`all 14 render as ${size}px SVG`, async ({ page }) => {
      await openGallery(page);
      const icons = page.getByTestId(`icons-${size}`).locator("svg");
      await expect(icons).toHaveCount(14);
      const boxes = await icons.evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return {
            w: r.width,
            h: r.height,
            paths: e.querySelectorAll("path").length,
          };
        }),
      );
      for (const b of boxes) {
        expect(b.w).toBe(size);
        expect(b.h).toBe(size);
        expect(b.paths).toBeGreaterThan(0);
      }
    });
  }
});
