import { expect, type Locator, type Page, test } from "@playwright/test";
import { Finger } from "../support/finger";
import {
  appReady,
  computed,
  expectNoHorizontalOverflow,
  expectTouchTargets,
  FIX,
} from "../support/fixture";

// WP3: the river panel, section rows, river rows and group headings in the
// calm design (doc/plans/ui-overhaul/calm-design.html, "River and section"
// and "A section list that fits"). Fixture: Test River with seven sections.

test.use({ hasTouch: true });

const TEAL = "rgb(14, 116, 144)";
const E1_COLOR = "rgba(31, 43, 49, 0.08)";

async function openRiver(page: Page) {
  await page.goto(`/?waterway=${FIX.waterway}`);
  await appReady(page);
  await expect(rows(page).first()).toBeVisible();
  await expect(
    page.locator("[data-level]:visible").first(),
    "level pills drawn (reseed the fixture if its readings are old)",
  ).toBeVisible();
}

const rows = (page: Page) => page.locator(".MuiListItemButton-root:visible");
const row = (page: Page, name: string) =>
  rows(page).filter({ hasText: name }).first();
const tab = (page: Page, name: string) =>
  page.getByRole("tab", { name, exact: true });

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error("element has no box");
  return b;
}

test.describe("section rows", () => {
  test("a row is a card: 52px or more, radius md, soft shadow, no border", async ({
    page,
  }) => {
    await openRiver(page);
    const r = row(page, "Lower Test");
    expect(
      Number.parseFloat(await computed(r, "height")),
    ).toBeGreaterThanOrEqual(52);
    expect(await computed(r, "border-top-left-radius")).toBe("14px");
    expect(await computed(r, "box-shadow")).toContain(E1_COLOR);
    expect(await computed(r, "border-top-width")).toBe("0px");
    expect(await computed(r, "background-color")).toBe("rgb(255, 255, 255)");
  });

  test("every row is a card and the cards are separated", async ({ page }) => {
    await openRiver(page);
    const boxes = await rows(page).evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, h: r.height };
      }),
    );
    expect(boxes.length).toBeGreaterThanOrEqual(7);
    for (const [i, b] of boxes.entries()) {
      expect(b.h, `row ${i} height`).toBeGreaterThanOrEqual(52);
      if (i > 0) expect(b.top - boxes[i - 1].bottom).toBeGreaterThanOrEqual(4);
    }
  });

  test("the level pills line up in one column", async ({ page }) => {
    await openRiver(page);
    const rights = await rows(page).evaluateAll((els) =>
      els
        .map((el) => el.querySelector("[data-level]"))
        .filter((p): p is Element => p !== null)
        .map((p) => Math.round(p.getBoundingClientRect().right)),
    );
    expect(rights.length).toBeGreaterThan(3);
    expect(new Set(rights).size, `pill right edges ${rights}`).toBe(1);
  });

  test("chips and the pill are spaced by the row gap only", async ({
    page,
  }) => {
    await openRiver(page);
    const margins = await rows(page).evaluateAll((els) =>
      els.flatMap((el) =>
        [...el.querySelectorAll(".MuiChip-root, [data-level]")].map(
          (c) => getComputedStyle(c).marginLeft,
        ),
      ),
    );
    expect(margins.length).toBeGreaterThan(0);
    expect(margins.filter((m) => m !== "0px")).toEqual([]);
  });

  test("the boat count sits in one column and keeps its icon", async ({
    page,
  }) => {
    await openRiver(page);
    const counts = page.locator(
      ".MuiListItemButton-root:visible [data-testid=boat-count]:has(svg)",
    );
    expect(await counts.count(), "rows with a boat count").toBeGreaterThan(0);
    const lefts = await counts.evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().left)),
    );
    expect(new Set(lefts).size, `count left edges ${lefts}`).toBe(1);
  });

  test("the whole row is the touch target", async ({ page }) => {
    await openRiver(page);
    await expectTouchTargets(rows(page), 44);
  });

  test("@small the row stacks: name above, pill at the right", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "small", "only the 320px phone stacks");
    await openRiver(page);
    await expectNoHorizontalOverflow(page);
    const r = row(page, "Lower Test");
    const rb = await box(r);
    const name = await box(r.getByText("Lower Test", { exact: true }));
    const pill = await box(r.locator("[data-level]"));
    expect(rb.width).toBeLessThan(330);
    expect(pill.x + pill.width).toBeLessThanOrEqual(rb.x + rb.width);
    expect(pill.x).toBeGreaterThan(name.x + name.width - 1);
    const count = r.locator("[data-testid=boat-count]");
    expect(await count.count(), "Lower Test has a boat count").toBe(1);
    const c = await box(count);
    expect(c.y, "count below the name").toBeGreaterThanOrEqual(
      name.y + name.height - 1,
    );
    const clipped = await rows(page).evaluateAll(
      (els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length,
    );
    expect(clipped, "rows wider than themselves").toBe(0);
    await expectTouchTargets(rows(page), 44);
  });

  test("@small at 130% text the stacked row holds", async ({ page }, info) => {
    test.skip(info.project.name !== "small", "only the 320px phone stacks");
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        document.documentElement.style.fontSize = "130%";
      });
    });
    await openRiver(page);
    await expectNoHorizontalOverflow(page);
    for (const name of ["Upper Test", "Silent Gauge Test", "High Water Test"]) {
      const r = row(page, name);
      const rb = await box(r);
      const parts = await r
        .locator("[data-level], [data-testid=grade-tag]")
        .evaluateAll((els) =>
          els.map((el) => {
            const b = el.getBoundingClientRect();
            return { l: b.left, r: b.right };
          }),
        );
      for (const p of parts) {
        expect(p.l).toBeGreaterThanOrEqual(rb.x - 0.5);
        expect(p.r).toBeLessThanOrEqual(rb.x + rb.width + 0.5);
      }
      expect(rb.height).toBeGreaterThanOrEqual(52);
    }
  });
});

test.describe("river panel", () => {
  test("the header names the river and the tabs are underlined", async ({
    page,
  }) => {
    await openRiver(page);
    await expect(
      page.locator("p:visible, h3:visible").filter({ hasText: /^Test River$/ }),
    ).toBeVisible();
    for (const name of ["Sections", "Gauges", "Notes"]) {
      await expect(tab(page, name)).toBeVisible();
    }
    const indicator = page.locator(".MuiTabs-indicator:visible");
    expect(await computed(indicator, "background-color")).toBe(TEAL);
    expect(await computed(indicator, "height")).toBe("3px");
    await expectTouchTargets(page.locator("button.MuiTab-root:visible"), 44);
  });

  test("a swipe moves Sections to Gauges and back", async ({ page }) => {
    await openRiver(page);
    const pane = page.locator("[data-testid=tab-pane]:visible");
    const b = await box(pane);
    const f = await Finger.down(page, b.x + b.width * 0.8, b.y + b.height / 2);
    await f.moveBy(-b.width * 0.55);
    await f.up();
    await expect(tab(page, "Gauges")).toHaveAttribute("aria-selected", "true");
    const g = await Finger.down(page, b.x + b.width * 0.2, b.y + b.height / 2);
    await g.moveBy(b.width * 0.55);
    await g.up();
    await expect(tab(page, "Sections")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("the pane follows the finger one to one", async ({ page }) => {
    await openRiver(page);
    const pane = page.locator("[data-testid=tab-pane]:visible");
    const b = await box(pane);
    const f = await Finger.down(page, b.x + b.width * 0.8, b.y + b.height / 2);
    await f.moveBy(-b.width * 0.3);
    const x = await pane.evaluate((el) => {
      const t = getComputedStyle(el).transform;
      return t === "none" ? 0 : new DOMMatrixReadOnly(t).m41;
    });
    expect(x).toBeLessThan(-b.width * 0.3 + 12);
    await f.up();
  });
});

test.describe("river rows and group headings", () => {
  async function openSearch(page: Page) {
    await page.addInitScript(() => {
      localStorage.setItem(
        "pm.recent-waterways",
        JSON.stringify([{ id: 9001, name: "Test River" }]),
      );
    });
    await page.goto("/?panel=true");
    await appReady(page);
  }

  test("the recent rivers heading is a sentence-case label", async ({
    page,
  }) => {
    await openSearch(page);
    const h = page
      .getByText("Recent rivers", { exact: true })
      .locator("visible=true");
    await expect(h).toBeVisible();
    expect(await computed(h, "text-transform")).toBe("none");
    expect(await computed(h, "letter-spacing")).toMatch(/^(0px|normal)$/);
    expect(await computed(h, "font-size")).toBe("13px");
    expect(await computed(h, "font-weight")).toBe("600");
  });

  test("a recent river is a card of 52px or more", async ({ page }) => {
    await openSearch(page);
    const r = rows(page).filter({ hasText: "Test River" }).first();
    await expect(r).toBeVisible();
    expect(
      Number.parseFloat(await computed(r, "height")),
    ).toBeGreaterThanOrEqual(52);
    expect(await computed(r, "border-top-left-radius")).toBe("14px");
    expect(await computed(r, "box-shadow")).toContain(E1_COLOR);
  });

  test("@small search results are cards that do not overflow", async ({
    page,
  }) => {
    await page.goto("/?panel=true&q=Test");
    await appReady(page);
    await page.getByRole("tab", { name: /^Rivers/ }).click();
    const r = rows(page).filter({ hasText: "Test River" }).first();
    await expect(r).toBeVisible();
    expect(await computed(r, "border-top-left-radius")).toBe("14px");
    expect(await computed(r, "box-shadow")).toContain(E1_COLOR);
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(rows(page), 44);
    const type = r.locator(".MuiChip-root").first();
    expect(await computed(type, "text-transform")).toBe("none");
  });
});

test.describe("section logs", () => {
  test("a section's logs are cards on the ground, not a bordered box", async ({
    page,
  }) => {
    await page.goto(`/?waterway=${FIX.waterway}&section=${FIX.sections.lower}`);
    await appReady(page);
    await tab(page, "Logs").click();
    const card = page.locator("[data-testid=section-log]:visible").first();
    await expect(card).toBeVisible();
    expect(await computed(card, "border-top-left-radius")).toBe("14px");
    expect(await computed(card, "box-shadow")).toContain(E1_COLOR);
    expect(await computed(card, "border-top-width")).toBe("0px");
  });
});
