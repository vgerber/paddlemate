import { expect, type Page, test } from "@playwright/test";
import { mockRegions } from "../map/regions.mock";
import { appReady } from "../support/fixture";

// Moment 1 (a detail from a list row) and moment 4 (the sheet release): what
// the browser computes while the panel moves.

interface Motion {
  duration: number;
  delay: number;
  /** Computed style with the animation held at 100 ms (after its delay). */
  at100: { transform: string; opacity: number };
  /** Computed style once it has finished. */
  end: { transform: string; opacity: number };
}

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;
const panel = (page: Page) =>
  page.getByTestId(isPhone(page) ? "overlay-content" : "side-panel");

/** Click the row, catch the panel's enter animation, hold it at 100 ms and
 * read what the browser computes. Frames in a headless run are too coarse to
 * sample by time, so the animation is stepped by its own clock. */
async function openRiver(page: Page): Promise<Motion> {
  const row = panel(page).getByText("Test River").first();
  await expect(row).toBeVisible();
  const phone = isPhone(page);
  await page.evaluate((phone) => {
    const target = () =>
      phone
        ? document.querySelector<HTMLElement>('[data-testid="overlay-content"]')
        : document.querySelector<HTMLElement>('[data-testid="side-panel"]')
            ?.parentElement;
    const win = window as unknown as { motion?: Motion };
    const style = (el: HTMLElement) => {
      const cs = getComputedStyle(el);
      return { transform: cs.transform, opacity: Number(cs.opacity) };
    };
    const frame = () => {
      const el = target();
      const anim = el?.getAnimations().find((a) => a instanceof Animation);
      if (!el || !anim || win.motion) return requestAnimationFrame(frame);
      const t = anim.effect?.getComputedTiming();
      const delay = Number(t?.delay ?? 0);
      anim.pause();
      anim.currentTime = delay + 100;
      const at100 = style(el);
      anim.finish();
      win.motion = {
        duration: Number(t?.duration ?? 0),
        delay,
        at100,
        end: style(el),
      };
    };
    requestAnimationFrame(frame);
  }, phone);
  await row.click();
  await page.waitForFunction(
    () => (window as unknown as { motion?: Motion }).motion,
  );
  return page.evaluate(() => (window as unknown as { motion: Motion }).motion);
}

const tx = (transform: string) =>
  transform === "none" ? 0 : Number(transform.split(",")[4]);
const ty = (transform: string) =>
  transform === "none" ? 0 : Number(transform.split(",")[5].replace(")", ""));

async function start(page: Page, motion?: "reduced") {
  if (motion) {
    await page.addInitScript(() =>
      localStorage.setItem("pm-motion", "reduced"),
    );
  }
  await mockRegions(page);
  await page.goto("/");
  await appReady(page);
  if (isPhone(page)) {
    await page.getByRole("button", { name: "Open search panel" }).click();
  }
}

test.describe("detail from a list row", () => {
  test("Full: the phone detail pushes in from the right", async ({ page }) => {
    test.skip(!isPhone(page), "the push is the phone's");
    await start(page);
    const m = await openRiver(page);
    expect(tx(m.at100.transform)).toBeGreaterThan(5);
    expect(tx(m.at100.transform)).toBeLessThan(40);
    expect(m.at100.opacity).toBeLessThan(1);
    expect(m.duration).toBe(360);
    expect(m.end.transform).toBe("none");
  });

  test("Full: the desktop pane waits 60 ms, rises 8 px and fades in", async ({
    page,
  }) => {
    test.skip(isPhone(page), "the cross-fade is the desktop's");
    await start(page);
    const m = await openRiver(page);
    expect(m.delay).toBe(60);
    expect(m.duration).toBe(160);
    expect(Math.abs(ty(m.at100.transform))).toBeLessThan(8);
    expect(m.at100.opacity).toBeLessThan(1);
    expect(m.end.opacity).toBe(1);
  });

  test("Reduced: nothing moves, opacity goes 0 to 1 in 140 ms", async ({
    page,
  }) => {
    await start(page, "reduced");
    const m = await openRiver(page);
    expect(m.at100.transform).toBe("none");
    expect(m.delay).toBe(0);
    expect(Math.abs(m.duration - 140)).toBeLessThanOrEqual(30);
    expect(m.at100.opacity).toBeGreaterThan(0.5);
    expect(m.at100.opacity).toBeLessThan(1);
  });
});

test.describe("sheet release", () => {
  test.skip(({ isMobile }) => !isMobile, "the sheet is the phone's");

  const region = (page: Page) => page.getByRole("region", { name: "Search" });
  const transition = (page: Page) =>
    region(page).evaluate((el) => (el as HTMLElement).style.transition);

  test("Full: the time grows with the distance and the curve settles going up", async ({
    page,
  }) => {
    await mockRegions(page);
    await page.goto("/?mode=area");
    await appReady(page);
    await expect(region(page)).toBeVisible();
    const peekTop = (await region(page).boundingBox())?.y ?? 0;
    await region(page).getByRole("button", { name: "Expand panel" }).click();
    const up = await page
      .getByRole("dialog", { name: "Search" })
      .evaluate((el) => (el as HTMLElement).style.transition);
    expect(up).toMatch(
      /^transform \d+ms cubic-bezier\(0\.22, 0\.9, 0\.28, 1\.02\)/,
    );
    const ms = Number.parseInt(up.split(" ")[1], 10);
    await page.waitForTimeout(450);
    const openTop =
      (await page.getByRole("dialog", { name: "Search" }).boundingBox())?.y ??
      0;
    const px = Math.abs(peekTop - openTop);
    expect(px).toBeGreaterThan(100);
    expect(Math.abs(ms - Math.min(360, 220 + 0.25 * px))).toBeLessThanOrEqual(
      1,
    );
    await page
      .getByRole("dialog", { name: "Search" })
      .getByRole("button", { name: "Shrink panel" })
      .click();
    const down = await transition(page).catch(() => "");
    expect(down === "" || !down.includes("1.02")).toBe(true);
  });

  test("Reduced: the sheet snaps", async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem("pm-motion", "reduced"),
    );
    await mockRegions(page);
    await page.goto("/?mode=area");
    await appReady(page);
    await region(page).getByRole("button", { name: "Expand panel" }).click();
    const t = await page
      .getByRole("dialog", { name: "Search" })
      .evaluate((el) => (el as HTMLElement).style.transition);
    expect(t).toBe("none");
  });
});
