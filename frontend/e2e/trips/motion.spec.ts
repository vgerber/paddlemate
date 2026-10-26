import { expect, type Page, test } from "@playwright/test";
import { FIX, selectFirstPlanDay } from "../support/fixture";

// WP14 M6: the plan calendar's motion (disc, week swap, month pull) and the
// trip folds. Motion is read from what the browser computes mid-transition.

const TRIP = FIX.trips[0];
const INOUT = "cubic-bezier(0.4, 0, 0.2, 1)";

async function openPlan(page: Page, motion?: "reduced") {
  test.skip(test.info().project.name === "desktop", "the phone calendar");
  if (motion) {
    await page.addInitScript(() =>
      localStorage.setItem("pm-motion", "reduced"),
    );
  }
  await page.goto(`/trips/${TRIP}`);
  await expect(page.getByTestId("plan-day").first()).toBeVisible();
  await selectFirstPlanDay(page);
}

interface Seen {
  anims: {
    prop: string;
    duration: number;
    keys: { transform: string; opacity: string }[];
  }[];
  delay: string;
  duration: string;
  easing: string;
}

/** Runs `act` in the page, waits two frames, then reports the animations and
 * transition styles of every element matching `sel`. */
async function sample(
  page: Page,
  act: string,
  sel: string,
  frames = 6,
): Promise<Seen[]> {
  return (await sampleMany(page, act, [sel], frames))[0];
}

async function sampleMany(
  page: Page,
  act: string,
  sels: string[],
  frames = 6,
): Promise<Seen[][]> {
  return page.evaluate(
    async ({ act, sels, frames }) => {
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      new Function(act)();
      for (let i = 0; i < frames; i++) await frame();
      return sels.map((sel) =>
        Array.from(document.querySelectorAll(sel)).map((el) => {
          const style = getComputedStyle(el);
          return {
            anims: el.getAnimations().map((a) => {
              const effect = a.effect as KeyframeEffect;
              return {
                prop:
                  "transitionProperty" in a ? String(a.transitionProperty) : "",
                duration: Number(effect.getTiming().duration),
                keys: effect.getKeyframes().map((k) => ({
                  transform: String(k.transform ?? ""),
                  opacity: String(k.opacity ?? ""),
                })),
              };
            }),
            delay: style.transitionDelay,
            duration: style.transitionDuration,
            easing: style.transitionTimingFunction,
          };
        }),
      );
    },
    { act, sels, frames },
  );
}

const DISC = "[data-testid=week-strip] [data-testid=current-disc]";
const pickInWeek = `
  const cells = [...document.querySelectorAll('[data-testid=week-strip] [data-testid=week-day]:not([disabled])')];
  cells.find((c) => c.dataset.current !== "true").click();`;
/** Picks the last (or first) day the month offers, from the open month. */
const pickFromMonth = (which: "last" | "first") => `
  const cells = [...document.querySelectorAll('[data-testid=month-panel] [data-testid=week-day]:not([disabled])')];
  cells.${which === "last" ? "at(-1)" : "at(0)"}.click();`;
const tapHandle = `
  document.querySelector('[data-testid=week-strip] button[aria-expanded]').dispatchEvent(
    new MouseEvent("click", { bubbles: true, detail: 0 }));`;

test.describe("calendar motion", () => {
  test("the disc slides to the day on the scale and the digit follows", async ({
    page,
  }) => {
    await openPlan(page);
    const [disc] = await sample(page, pickInWeek, DISC);
    const slide = disc.anims.filter((a) => a.prop === "transform");
    expect(slide).toHaveLength(1);
    expect(slide[0].duration).toBe(260);
    expect(disc.easing).toBe(INOUT);
    const [digit] = await sample(
      page,
      "",
      "[data-testid=week-strip] [data-current=true] [data-testid=day-number]",
    );
    expect(digit.delay).toBe("0.06s");
    expect(digit.duration).toBe("0.16s");
  });

  test("a second pick retargets the slide, nothing queues", async ({
    page,
  }) => {
    await openPlan(page);
    await sample(page, pickInWeek, DISC);
    const [disc] = await sample(
      page,
      `${pickInWeek.replace('find((c) => c.dataset.current !== "true")', 'findLast((c) => c.dataset.current !== "true")')}`,
      DISC,
    );
    expect(disc.anims.filter((a) => a.prop === "transform")).toHaveLength(1);
  });

  test("the next week slides in from the side the list scrolled to", async ({
    page,
  }) => {
    await openPlan(page);
    await page.evaluate(tapHandle);
    await expect(page.getByTestId("month-scrim")).toHaveCSS("opacity", "1");
    const [forward, forwardDiscs] = await sampleMany(
      page,
      pickFromMonth("last"),
      [
        "[data-testid=week-pane]",
        "[data-testid=week-pane] [data-testid=current-disc]",
      ],
    );
    expect(forward.map((p) => p.anims.length)).toEqual([1, 1]);
    const [out, enter] = forward;
    expect(enter.anims[0].keys.map((k) => k.transform)).toEqual([
      "translateX(100%)",
      "translateX(0px)",
    ]);
    expect(out.anims[0].keys.map((k) => k.transform)).toEqual([
      "translateX(0px)",
      "translateX(-100%)",
    ]);
    expect(enter.anims[0].duration).toBe(260);
    // The old disc fades out and the new one in.
    const fades = forwardDiscs.flatMap((d) =>
      d.anims.filter((a) => a.prop === "").map((a) => a.keys[0].opacity),
    );
    expect(fades.sort()).toEqual(["0", "1"]);
    await expect(page.getByTestId("week-pane")).toHaveCount(1);

    await page.evaluate(tapHandle);
    await expect(page.getByTestId("month-scrim")).toHaveCSS("opacity", "1");
    const back = await sample(
      page,
      pickFromMonth("first"),
      "[data-testid=week-pane]",
    );
    expect(back[1].anims[0].keys[0].transform).toBe("translateX(-100%)");
  });

  test("the leaving week is out of the tab order and the a11y tree", async ({
    page,
  }) => {
    await openPlan(page);
    await page.evaluate(tapHandle);
    await expect(page.getByTestId("month-scrim")).toHaveCSS("opacity", "1");
    const seen = await page.evaluate(
      (pick) =>
        new Promise<{
          inert: boolean;
          hidden: string | null;
          live: number;
          incoming: number;
        }>((resolve) => {
          const look = () => {
            const out = document.querySelector<HTMLElement>(
              "[data-testid=week-pane][data-mode=out]",
            );
            if (!out) return requestAnimationFrame(look);
            const stage = out.closest("[data-testid=week-stage]");
            const live = [...(stage?.querySelectorAll("button") ?? [])].filter(
              (b) => !b.closest("[inert]") && !b.closest("[aria-hidden]"),
            ).length;
            resolve({
              inert: out.inert,
              hidden: out.getAttribute("aria-hidden"),
              live,
              incoming:
                stage?.querySelectorAll(
                  "[data-testid=week-pane]:not([data-mode=out]) button",
                ).length ?? 0,
            });
          };
          look();
          new Function(pick)();
        }),
      pickFromMonth("last"),
    );
    expect(seen.inert).toBe(true);
    expect(seen.hidden).toBe("true");
    // One set of day buttons, not two.
    expect(seen.incoming).toBeGreaterThan(0);
    expect(seen.live).toBe(seen.incoming);
  });

  test("the month opens from the active week, fanning 22 ms per week", async ({
    page,
  }) => {
    await openPlan(page);
    const weeks = await sample(page, tapHandle, "[data-pr=week]");
    expect(weeks.length).toBeGreaterThanOrEqual(4);
    const delays = weeks.map((w) => Number.parseFloat(w.delay) * 1000);
    const anchor = delays.indexOf(0);
    expect(anchor).toBeGreaterThanOrEqual(0);
    delays.forEach((d, j) => {
      expect(Math.round(d)).toBe(22 * Math.abs(j - anchor));
    });
    expect(weeks[0].duration.split(",")[0]).toBe("0.26s");
    const [panel] = await sample(page, "", "[data-testid=month-panel]");
    expect(panel.duration).toBe("0.26s");
    await expect(page.getByTestId("month-scrim")).toHaveCSS("opacity", "1");
    await expect(
      page.getByTestId("month-panel").locator("[data-pr=week]").first(),
    ).toHaveCSS("transform", /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);

    // Folding back has no stagger and the month leaves the page after it.
    const closing = await sample(page, tapHandle, "[data-pr=week]");
    for (const w of closing) expect(w.delay.split(",")[0]).toBe("0s");
    await expect(page.getByTestId("month-panel")).toHaveCount(0);
  });

  test("a pull follows the finger 1:1 and releases on the scale", async ({
    page,
  }) => {
    await openPlan(page);
    const handle = page.getByRole("button", { name: "Show the month" });
    const box = await handle.boundingBox();
    if (!box) throw new Error("no handle");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 30, { steps: 5 });
    await page.mouse.move(x, y + 60, { steps: 5 });
    await expect(handle).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 60)");
    const scrim = page.getByTestId("month-scrim");
    const half = Number(
      await scrim.evaluate((el) => getComputedStyle(el).opacity),
    );
    expect(half).toBeGreaterThan(0.1);
    expect(half).toBeLessThan(0.9);
    await page.mouse.up();
    await expect(page.getByTestId("month-grid")).toBeVisible();
    await expect(scrim).toHaveCSS("opacity", "1");
  });

  test("picking a date closes the month while the list scrolls", async ({
    page,
  }) => {
    await openPlan(page);
    await page.evaluate(tapHandle);
    await expect(page.getByTestId("month-scrim")).toHaveCSS("opacity", "1");
    const seen = await page.evaluate(async () => {
      const list = [
        ...document.querySelectorAll("[data-testid=plan-scroll]"),
      ].find((e) => (e as HTMLElement).offsetParent) as HTMLElement;
      const cells = [
        ...document.querySelectorAll(
          "[data-testid=month-panel] [data-testid=week-day]:not([disabled])",
        ),
      ] as HTMLElement[];
      const before = list.scrollTop;
      cells[cells.length - 1].click();
      for (let i = 0; i < 6; i++)
        await new Promise((r) => requestAnimationFrame(r));
      const scrim = document.querySelector("[data-testid=month-scrim]");
      return {
        closing: scrim ? getComputedStyle(scrim).opacity : "gone",
        before,
        mid: list.scrollTop,
      };
    });
    // The scrim is still fading and the list is already on its way.
    expect(Number(seen.closing)).toBeLessThan(1);
    expect(seen.mid).toBeGreaterThan(seen.before);
    await expect.poll(() => page.getByTestId("month-panel").count()).toBe(0);
    const end = await page
      .getByTestId("plan-scroll")
      .filter({ visible: true })
      .evaluate((el) => el.scrollTop);
    expect(end).toBeGreaterThanOrEqual(seen.mid);
  });

  test("a day card folds open on the scale", async ({ page }) => {
    await openPlan(page);
    const card = page.getByTestId("plan-day").first();
    const fold = await card.evaluate(async (el) => {
      (el as HTMLElement).click();
      await new Promise((r) => setTimeout(r, 40));
      return Array.from(el.querySelectorAll(".MuiCollapse-root")).map(
        (wrap) => getComputedStyle(wrap).transitionDuration,
      );
    });
    // The summary folds away in 70% of the time, the detail opens in full.
    expect(fold).toEqual(["0.182s", "0.26s"]);
  });
});

test.describe("calendar motion, reduced", () => {
  test("the disc cross-fades in place, the weeks and the month fade", async ({
    page,
  }) => {
    await openPlan(page, "reduced");
    const disc = await sample(page, pickInWeek, DISC, 3);
    expect(disc.some((d) => d.anims.some((a) => a.duration === 140))).toBe(
      true,
    );
    expect(
      disc.every((d) => d.anims.every((a) => a.prop !== "transform")),
    ).toBe(true);
    const ghost = page.getByTestId("ghost-disc");
    await expect(ghost).toHaveCount(0);

    await page.evaluate(tapHandle);
    await expect(page.getByTestId("month-scrim")).toHaveCSS("opacity", "1");
    const panes = await sample(
      page,
      pickFromMonth("last"),
      "[data-testid=week-pane]",
      3,
    );
    for (const p of panes) {
      expect(p.anims).toHaveLength(1);
      expect(p.anims[0].duration).toBe(140);
      expect(p.anims[0].keys.every((k) => k.transform === "")).toBe(true);
    }
    await expect(page.getByTestId("week-pane")).toHaveCount(1);

    const [panel] = await sample(
      page,
      tapHandle,
      "[data-testid=month-panel]",
      3,
    );
    expect(panel.anims.map((a) => a.duration)).toContain(140);
    const [scrim] = await sample(page, "", "[data-testid=month-scrim]");
    expect(scrim.duration).toBe("0.14s");
    await expect(page.getByTestId("month-panel")).toBeVisible();
  });

  test("a pick scrolls the list at once and a drag stays 1:1", async ({
    page,
  }) => {
    await openPlan(page, "reduced");
    await page.evaluate(tapHandle);
    await expect(page.getByTestId("month-grid")).toBeVisible();
    const scrolled = await page.evaluate(async () => {
      const list = [
        ...document.querySelectorAll("[data-testid=plan-scroll]"),
      ].find((e) => (e as HTMLElement).offsetParent) as HTMLElement;
      const cells = document.querySelectorAll<HTMLElement>(
        "[data-testid=month-panel] [data-testid=week-day]:not([disabled])",
      );
      cells[3].click();
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(r));
      const early = list.scrollTop;
      await new Promise((r) => setTimeout(r, 500));
      return { early, late: list.scrollTop };
    });
    expect(scrolled.early).toBeGreaterThan(0);
    expect(scrolled.early).toBe(scrolled.late);

    const handle = page.getByRole("button", { name: "Show the month" });
    const box = await handle.boundingBox();
    if (!box) throw new Error("no handle");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 40, {
      steps: 4,
    });
    await expect(handle).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 40)");
    await page.mouse.up();
  });
});
