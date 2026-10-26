import { expect, type Page, test } from "@playwright/test";
import { appReady } from "../support/fixture";

// WP14 M7: press, spinner delay and snackbar feedback, measured from what the
// browser computes mid-transition.

const ROW = ".MuiListItemButton-root:visible";

async function openList(page: Page) {
  await page.goto("/?waterway=9001");
  await appReady(page);
  await expect(page.locator(ROW).first()).toBeVisible();
}

async function reduce(page: Page) {
  await page.addInitScript(() => localStorage.setItem("pm-motion", "reduced"));
}

const overlay = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) =>
      Number.parseFloat(getComputedStyle(el, "::before").opacity),
    );

async function pressAt(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error("no box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  return () => page.mouse.up();
}

test.describe("press feedback", () => {
  test("a row's overlay reaches .08 within 90 ms of pointer-down", async ({
    page,
  }) => {
    await openList(page);
    const row = page.locator(ROW).first();
    const box = await row.boundingBox();
    if (!box) throw new Error("no box");
    await page.mouse.move(box.x + 4, box.y + box.height / 2);
    // Frame timing under a live map is too coarse for wall-clock checks, so
    // read the transition the browser ran: opacity, 90 ms, ending at .08.
    await row.evaluate((el) => {
      const w = window as unknown as { __ends: Promise<number> };
      w.__ends = new Promise((resolve) => {
        el.addEventListener("transitionend", (ev) => {
          const e = ev as TransitionEvent;
          if (e.propertyName === "opacity" && e.pseudoElement === "::before")
            resolve(e.elapsedTime);
        });
      });
    });
    await page.mouse.down();
    const run = await row.evaluate(async (el) => ({
      duration:
        (await (window as unknown as { __ends: Promise<number> }).__ends) *
        1000,
      end: Number.parseFloat(getComputedStyle(el, "::before").opacity),
    }));
    expect(run.duration).toBe(90);
    expect(run.end).toBeCloseTo(0.08, 2);
    await page.mouse.move(0, 0);
    await page.mouse.up();
  });

  test("a selected row has a wash and one 3 px bar", async ({ page }, info) => {
    test.skip(info.project.name.startsWith("phone"), "no selected row on a phone");
    await page.goto("/settings?group=appearance");
    const sel = page.locator(`${ROW}.Mui-selected`).first();
    await expect(sel).toBeVisible();
    const look = await sel.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        shadow: s.boxShadow,
        after: getComputedStyle(el, "::after").content,
        d: s.transitionDuration,
      };
    });
    // The bar is the row's own inset edge (openRowSx), which follows its
    // corners; no second, straight bar is drawn over it.
    expect(look.shadow).toContain("inset");
    expect(look.shadow).toMatch(/3px 0px 0px 0px/);
    expect(look.after === "none" || look.after === "normal").toBe(true);
    expect(look.d).toContain("0.09s");
  });

  test("a button scales to .985 while pressed, and not under reduced", async ({
    page,
  }) => {
    await page.goto("/dev/primitives");
    const btn = page.locator("button.MuiButton-root:visible").first();
    await expect(btn).toBeVisible();
    const sel = "button.MuiButton-root:visible";
    const up = await pressAt(page, sel);
    await page.waitForTimeout(250);
    const t = await btn.evaluate((el) => getComputedStyle(el).transform);
    expect(t).toMatch(/^matrix\(0\.985,/);
    expect(await overlay(page, sel)).toBeGreaterThan(0.07);
    await page.mouse.move(0, 0);
    await up();
  });

  test("reduced motion keeps the overlay but not the scale", async ({
    page,
  }) => {
    await reduce(page);
    await page.goto("/dev/primitives");
    const sel = "button.MuiButton-root:visible";
    const btn = page.locator(sel).first();
    await expect(btn).toBeVisible();
    const up = await pressAt(page, sel);
    await page.waitForTimeout(250);
    expect(await btn.evaluate((el) => getComputedStyle(el).transform)).toBe(
      "none",
    );
    expect(await overlay(page, sel)).toBeGreaterThan(0.07);
    await page.mouse.move(0, 0);
    await up();
  });
});

test.describe("spinner delay", () => {
  test("a loading spinner is not visible at 100 ms, then fades in", async ({
    page,
  }) => {
    await page.route("**/api/**", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page.goto("/logs");
    // Seek the delay animation on the spinner's wrapper, so slow frames
    // cannot move the reading: at 100 ms it is still hidden, at 500 ms in.
    const [early, late] = await page.evaluate(
      () =>
        new Promise<[number, number]>((resolve) => {
          const look = () => {
            const el = document.querySelector("[data-delayed-spinner]");
            const anim = el
              ?.getAnimations()
              .find((a) => a.effect?.getTiming().delay === 150);
            if (!el || !anim) return requestAnimationFrame(look);
            anim.pause();
            const at = (ms: number) => {
              anim.currentTime = ms;
              return Number.parseFloat(getComputedStyle(el).opacity);
            };
            resolve([at(100), at(500)]);
          };
          look();
        }),
    );
    expect(early).toBeLessThan(0.05);
    expect(late).toBeGreaterThan(0.9);
  });

  test("a delayed spinner still turns", async ({ page }) => {
    await page.route("**/api/**", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page.goto("/logs");
    const bar = page.locator("[data-delayed-spinner] [role=progressbar]");
    await expect(bar.first()).toBeAttached();
    await expect
      .poll(() =>
        bar.first().evaluate((el) =>
          el
            .getAnimations()
            .filter((a) => a.playState === "running")
            .map((a) => a.effect?.getTiming().duration),
        ),
      )
      // MUI's rotate runs 1.4 s, linear, forever.
      .toContain(1400);
  });
});

test.describe("snackbar", () => {
  test("rises 8 px as it arrives and leaves faster", async ({ page }) => {
    await openList(page);
    const path = await page.evaluate(
      () =>
        performance
          .getEntriesByType("resource")
          .map((r) => r.name)
          .find((n) => n.includes("/src/components/AppSnackbar.tsx")) ?? "",
    );
    await page.evaluate(async (url) => {
      // The URL the app loaded (Vite adds ?t= after a hot update).
      const m = await import(/* @vite-ignore */ url);
      m.showErrorSnackbar("Could not save");
    }, path);
    const rise = page.locator("[data-snackbar-rise]");
    await expect(rise).toBeVisible();
    // Arrives on the fast step, easing out.
    await expect(rise).toHaveCSS("transition-duration", "0.16s, 0.16s");
    // Leaves at 70% of that, 8 px down: watch the inline style it is given.
    const leaving = await rise.evaluate(
      (el) =>
        new Promise<{ y: string; time: string }>((resolve) => {
          const seen = new MutationObserver(() => {
            if (el.style.opacity !== "0") return;
            seen.disconnect();
            resolve({
              y: el.style.transform,
              time: el.style.transitionDuration || el.style.transition,
            });
          });
          seen.observe(el, { attributes: true, attributeFilter: ["style"] });
          document.querySelector<HTMLElement>('[role="alert"] button')?.click();
        }),
    );
    expect(leaving.y).toBe("translateY(8px)");
    expect(leaving.time).toContain("112ms");
  });
});
