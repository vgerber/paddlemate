import { expect, type Locator, type Page, test } from "@playwright/test";
import { gotoSection } from "../support/fixture";

// Moment 2 (the features card): the band fold, the card fold to the strip and
// the selection fade, as the browser computes them. Lower Test has the range
// Slot Machine III+ with Big Hole inside.

const EASE_IN_OUT = "cubic-bezier(0.4, 0, 0.2, 1)";

const card = (page: Page) =>
  page.getByTestId("features-card").filter({ visible: true });
const band = (page: Page) => card(page).locator('[data-band="range"]').first();

async function open(page: Page, reduced = false) {
  if (reduced) {
    await page.addInitScript(() =>
      localStorage.setItem("pm-motion", "reduced"),
    );
  }
  await gotoSection(page, "lower");
  await expect(card(page)).toBeVisible();
}

interface Timing {
  property: string;
  duration: number;
  easing: string;
}

/** Click, then read the fold's own transition and hold it halfway. */
async function foldAndSample(trigger: Locator, fold: Locator) {
  const handle = await fold.elementHandle();
  if (!handle) throw new Error("fold not found");
  const sampled = handle.evaluate((el) => {
    return new Promise<{
      timing: Timing | null;
      before: number;
      half: number;
      after: number;
    }>((resolve) => {
      const before = el.getBoundingClientRect().height;
      const frame = () => {
        const anim = el
          .getAnimations()
          .find(
            (a): a is CSSTransition =>
              a instanceof CSSTransition &&
              a.transitionProperty === "grid-template-rows",
          );
        if (!anim) return requestAnimationFrame(frame);
        const t = anim.effect?.getComputedTiming();
        const timing = {
          property: anim.transitionProperty,
          duration: Number(t?.duration ?? 0),
          easing: String(t?.easing ?? ""),
        };
        anim.pause();
        anim.currentTime = timing.duration / 2;
        const half = el.getBoundingClientRect().height;
        anim.finish();
        resolve({
          timing,
          before,
          half,
          after: el.getBoundingClientRect().height,
        });
      };
      requestAnimationFrame(frame);
    });
  });
  await trigger.click();
  return sampled;
}

test.describe("features card motion", () => {
  test("a band folds by grid rows on the base time, in-out", async ({
    page,
  }) => {
    await open(page);
    const fold = band(page).locator(":scope > [data-fold]");
    const head = band(page).locator("[data-row]").first();
    const r = await foldAndSample(head, fold);
    expect(r.timing).toEqual({
      property: "grid-template-rows",
      duration: 260,
      easing: EASE_IN_OUT,
    });
    expect(r.half, "halfway through the fold").toBeLessThan(r.before);
    expect(r.half).toBeGreaterThan(r.after);
    expect(r.after).toBe(0);
  });

  test("the rows fade first when it closes, last when it opens", async ({
    page,
  }) => {
    await open(page);
    const fold = band(page).locator(":scope > [data-fold]");
    const body = fold.locator(":scope > [data-fold-body]");
    const head = band(page).locator("[data-row]").first();
    const fade = () =>
      body.evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          duration: s.transitionDuration.split(",")[0],
          delay: s.transitionDelay.split(",")[0],
        };
      });
    await head.click();
    await expect(fold).toHaveAttribute("data-fold", "shut");
    expect(await fade()).toEqual({ duration: "0.16s", delay: "0s" });
    await head.click();
    await expect(fold).toHaveAttribute("data-fold", "open");
    expect(await fade()).toEqual({ duration: "0.16s", delay: "0.09s" });
  });

  test("a shut band leaves its rows out of reach", async ({ page }) => {
    await open(page);
    const fold = band(page).locator(":scope > [data-fold]");
    await band(page).locator("[data-row]").first().click();
    await expect(
      fold.locator("[data-row]").first(),
      "hidden once the fade is done",
    ).toBeHidden();
  });

  test("the card folds to its strip over the same time and curve", async ({
    page,
  }) => {
    await open(page);
    const fold = card(page).locator(":scope > [data-fold]");
    const r = await foldAndSample(
      card(page).getByTestId("features-fold"),
      fold,
    );
    expect(r.timing).toEqual({
      property: "grid-template-rows",
      duration: 260,
      easing: EASE_IN_OUT,
    });
    expect(r.after).toBe(0);
    expect(r.half).toBeLessThan(r.before);
    await expect(card(page)).toHaveAttribute("data-folded", "");
    await expect(card(page).getByTestId("features-strip")).toBeVisible();
    await expect(
      card(page).getByTestId("features-fold"),
      "chevron turns",
    ).toHaveAttribute("aria-expanded", "false");
    await card(page).getByTestId("features-fold").click();
    await expect(card(page)).not.toHaveAttribute("data-folded", "");
    await expect(fold).toHaveAttribute("data-fold", "open");
  });

  test("the selected row's fill fades on the fast time", async ({ page }) => {
    await open(page);
    const r = card(page).locator("[data-row]").filter({ hasText: "Bridge" });
    const t = (l: Locator, p: "transitionDuration" | "transitionProperty") =>
      l.evaluate((el, p) => getComputedStyle(el)[p], p);
    expect(await t(r.first(), "transitionProperty")).toContain(
      "background-color",
    );
    expect(await t(r.first(), "transitionDuration")).toBe("0.16s");
    const disc = r.first().locator("[data-row-disc]");
    expect(await t(disc, "transitionDuration")).toBe("0.16s, 0.16s");
  });
});

test.describe("features card motion, reduced", () => {
  test("the band snaps after a short fade", async ({ page }) => {
    await open(page, true);
    const fold = band(page).locator(":scope > [data-fold]");
    const body = fold.locator(":scope > [data-fold-body]");
    await band(page).locator("[data-row]").first().click();
    await expect(fold).toHaveAttribute("data-fold", "shut");
    const s = await fold.evaluate((el) => {
      const c = getComputedStyle(el);
      return { duration: c.transitionDuration, delay: c.transitionDelay };
    });
    expect(s).toEqual({ duration: "0s", delay: "0.14s" });
    expect(
      await body.evaluate((el) => getComputedStyle(el).transitionDuration),
    ).toContain("0.14s");
    await expect
      .poll(() => fold.evaluate((el) => el.getBoundingClientRect().height))
      .toBe(0);
  });

  test("the card snaps and nothing turns", async ({ page }) => {
    await open(page, true);
    const fold = card(page).locator(":scope > [data-fold]");
    const chev = card(page).getByTestId("features-fold");
    await chev.click();
    await expect(card(page)).toHaveAttribute("data-folded", "");
    expect(
      await chev
        .locator("svg")
        .evaluate((el) => getComputedStyle(el).transitionDuration),
    ).toMatch(/^0(\.001)?s$/);
    await expect
      .poll(() => fold.evaluate((el) => el.getBoundingClientRect().height))
      .toBe(0);
  });
});

const NAMES = [
  "Put in",
  "Slot Machine",
  "Big Hole",
  "Altes Wehr",
  "Portage",
  "Strainer",
  "Bridge",
  "Take out",
];

async function expectAllNamed(page: Page) {
  for (const name of NAMES) {
    const r = card(page).locator("[data-row]").filter({ hasText: name });
    await expect(r.first(), name).toBeVisible();
    const box = await r.first().boundingBox();
    expect(box?.height ?? 0, `${name} has height`).toBeGreaterThan(40);
  }
}

test.describe("every feature shows on a phone", () => {
  for (const reduced of [false, true]) {
    test.describe(reduced ? "reduced" : "full", () => {
      test.use({
        viewport: { width: 600, height: 800 },
        hasTouch: false,
      });

      test("also after folding and opening each band and the card", async ({
        page,
      }) => {
        await open(page, reduced);
        await expectAllNamed(page);
        const bands = card(page).locator("[data-band]");
        for (let i = 0; i < (await bands.count()); i++) {
          const head = bands.nth(i).locator("[data-row]").first();
          await head.click();
          await expect(
            bands.nth(i).locator(":scope > [data-fold]"),
          ).toHaveAttribute("data-fold", "shut");
          await head.click();
          await expect(
            bands.nth(i).locator(":scope > [data-fold]"),
          ).toHaveAttribute("data-fold", "open");
        }
        await expectAllNamed(page);
        const chev = card(page).getByTestId("features-fold");
        await chev.click();
        await chev.click();
        await expectAllNamed(page);
        const tab = (name: string) =>
          page.getByRole("tab", { name }).filter({ visible: true });
        await tab("Notes").click();
        await tab("Features").click();
        await expectAllNamed(page);
      });
    });
  }
});
