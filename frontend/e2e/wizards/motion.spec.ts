import { expect, type Page, test } from "@playwright/test";
import { appReady, FIX } from "../support/fixture";

// Moment 6: wizard steps slide the way you go, the saved mark draws once.
// Animations are paused the moment they are created and read at a set time,
// because headless frames are too coarse to sample by the clock.

test.use({ hasTouch: true });

const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 768;
const pane = (page: Page) =>
  page.getByTestId(isDesktop(page) ? "side-panel" : "mobile-overlay");

async function setMotion(page: Page, mode: "reduced" | "full") {
  await page.addInitScript((m) => localStorage.setItem("pm-motion", m), mode);
}

async function startLog(page: Page) {
  await page.goto(
    `/logs/new?waterwayId=${FIX.waterway}&sectionId=${FIX.sections.upper}`,
  );
  await expect(page.getByText("Step 1 of 3 · When")).toBeVisible();
}

interface Held {
  leave: { transform: string; opacity: number };
  enter: { transform: string; opacity: number };
  rawEnd: { transform: string; opacity: number };
}

/** Watch for the leaving step to appear after `trigger`, pause both step
 * animations and read them at `at` ms into their own timeline. */
async function holdStep(
  page: Page,
  trigger: () => Promise<void>,
  at: number,
): Promise<Held> {
  await page.evaluate(() => {
    const w = window as unknown as { __held?: unknown };
    w.__held = undefined;
    const obs = new MutationObserver(() => {
      const ghost = document.querySelector<HTMLElement>("[data-step-ghost]");
      if (!ghost || w.__held) return;
      const enter = document.querySelector<HTMLElement>("[data-step-enter]");
      if (!enter) return;
      const set = (el: HTMLElement, t: number) => {
        for (const a of el.getAnimations()) {
          a.pause();
          a.currentTime = t;
        }
      };
      set(ghost, 0);
      set(enter, 0);
      w.__held = { ghost, enter };
      obs.disconnect();
    });
    obs.observe(document.body, { childList: true, subtree: true });
  });
  await trigger();
  return page.evaluate(async (at) => {
    const w = window as unknown as {
      __held: { ghost: HTMLElement; enter: HTMLElement };
    };
    const { ghost, enter } = w.__held;
    const read = (el: HTMLElement) => {
      const cs = getComputedStyle(el);
      return { transform: cs.transform, opacity: Number(cs.opacity) };
    };
    // The arriving step is read at its start (it waits 60 ms first).
    for (const a of ghost.getAnimations()) a.currentTime = at;
    const held = { leave: read(ghost), enter: read(enter) };
    for (const el of [ghost, enter]) {
      for (const a of el.getAnimations()) a.finish();
    }
    return { ...held, rawEnd: read(enter) };
  }, at);
}

const tx = (transform: string) => {
  if (transform === "none") return 0;
  return Number(transform.replace("matrix(", "").split(",")[4]);
};

test.describe("wizard step change", () => {
  test("forward leaves left and arrives from the right, back mirrors it", async ({
    page,
  }) => {
    await startLog(page);
    const next = page.getByRole("button", { name: "Next" });
    const fwd = await holdStep(page, () => next.click(), 70);
    expect(tx(fwd.leave.transform)).toBeLessThan(-2);
    expect(tx(fwd.leave.transform)).toBeGreaterThanOrEqual(-16);
    expect(fwd.leave.opacity).toBeGreaterThan(0);
    expect(fwd.leave.opacity).toBeLessThan(1);
    expect(tx(fwd.enter.transform)).toBe(16);
    expect(fwd.enter.opacity).toBe(0);
    expect(fwd.rawEnd.transform).toBe("none");
    await expect(page.getByText("Step 2 of 3 · Sections")).toBeVisible();

    const back = await holdStep(
      page,
      () => page.getByRole("button", { name: "Back" }).click(),
      70,
    );
    expect(tx(back.leave.transform)).toBeGreaterThan(2);
    expect(tx(back.enter.transform)).toBe(-16);
    await expect(page.getByText("Step 1 of 3 · When")).toBeVisible();
  });

  test("the footer button does not move while the step changes", async ({
    page,
  }) => {
    await startLog(page);
    const next = page.getByRole("button", { name: "Next" });
    const before = await next.boundingBox();
    await holdStep(page, () => next.click(), 70);
    const after = await page
      .getByRole("button", { name: "Next" })
      .boundingBox();
    expect(after).toEqual(before);
  });

  test("reduced: a cross-fade with no movement", async ({ page }) => {
    await setMotion(page, "reduced");
    await startLog(page);
    const held = await holdStep(
      page,
      () => page.getByRole("button", { name: "Next" }).click(),
      70,
    );
    expect(held.leave.transform).toBe("none");
    expect(held.enter.transform).toBe("none");
    expect(held.leave.opacity).toBeGreaterThan(0);
    expect(held.leave.opacity).toBeLessThan(1);
    expect(held.enter.opacity).toBe(0);
  });
});

test.describe("saved mark", () => {
  async function openRiverForm(page: Page) {
    await page.route("**/api/v1/waterways", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: 99999, name: "canned" }),
      });
    });
    await page.goto("/?panel=1");
    await appReady(page);
    const docked = page
      .getByRole("button", { name: "New river" })
      .filter({ visible: true });
    if (await docked.count()) {
      await docked.first().click();
    } else {
      await page
        .getByPlaceholder("Name", { exact: true })
        .filter({ visible: true })
        .fill("zzzqqq");
      await page
        .locator("button.MuiTab-root", { hasText: /^Rivers( \(\d+\))?$/ })
        .filter({ visible: true })
        .click();
      await page
        .getByRole("button", { name: "Can't find your river? Add it" })
        .filter({ visible: true })
        .click();
    }
    await pane(page).getByLabel("Name").first().fill("Motion Spec Creek");
  }

  async function submitHeld(page: Page) {
    await page.evaluate(() => {
      const w = window as unknown as { __saved?: boolean };
      const obs = new MutationObserver(() => {
        const el = document.querySelector('[data-testid="saved-mark"]');
        if (!el || w.__saved) return;
        w.__saved = true;
        for (const a of el.getAnimations({ subtree: true })) a.pause();
        obs.disconnect();
      });
      obs.observe(document.body, { childList: true, subtree: true });
    });
    await pane(page).getByRole("button", { name: "Submit" }).click();
    await expect(page.getByTestId("saved-mark")).toBeVisible();
  }

  const state = (page: Page) =>
    page.evaluate(() => {
      const q = (s: string) =>
        document.querySelector(`[data-saved="${s}"]`) as Element;
      const el = document.querySelector('[data-testid="saved-mark"]');
      const at = (t: number) => {
        for (const a of el?.getAnimations({ subtree: true }) ?? []) {
          a.currentTime = t;
        }
        return {
          circle: parseFloat(getComputedStyle(q("circle")).strokeDashoffset),
          check: parseFloat(getComputedStyle(q("check")).strokeDashoffset),
          riseY: getComputedStyle(q("title")).transform,
          titleOpacity: Number(getComputedStyle(q("title")).opacity),
        };
      };
      return { start: at(0), end: at(5000) };
    });

  test("the circle draws, the check follows, the title rises", async ({
    page,
  }) => {
    await openRiverForm(page);
    await submitHeld(page);
    const { start, end } = await state(page);
    expect(start.circle).toBeGreaterThan(100);
    expect(start.check).toBeGreaterThan(20);
    expect(start.riseY).toContain("8)");
    expect(start.titleOpacity).toBe(0);
    expect(end.circle).toBe(0);
    expect(end.check).toBe(0);
    expect(end.riseY).toBe("none");
    expect(end.titleOpacity).toBe(1);
  });

  test("reduced: drawn at once", async ({ page }) => {
    await setMotion(page, "reduced");
    await openRiverForm(page);
    await pane(page).getByRole("button", { name: "Submit" }).click();
    await expect(page.getByTestId("saved-mark")).toBeVisible();
    const drawn = await page.evaluate(() => {
      const q = (s: string) =>
        document.querySelector(`[data-saved="${s}"]`) as Element;
      return {
        circle: getComputedStyle(q("circle")).animationName,
        check: getComputedStyle(q("check")).animationName,
        offset: getComputedStyle(q("circle")).strokeDashoffset,
        title: getComputedStyle(q("title")).transform,
      };
    });
    expect(drawn.circle).toBe("none");
    expect(drawn.check).toBe("none");
    expect(drawn.offset).toBe("0px");
    expect(drawn.title).toBe("none");
  });
});
