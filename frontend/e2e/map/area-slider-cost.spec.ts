import { expect, test } from "@playwright/test";
import { appReady } from "../support/fixture";

// Dragging the Area radius re-renders the section rows on every step. A row's
// grade and length are worked out from the section line, so recomputing them
// per render turns a drag into seconds of script. The script time the drag
// costs must stay under a bound. The CPU is not throttled: software WebGL
// repaints then slow every input event until it times out, and the script
// time is what the budget measures anyway.

test.use({ hasTouch: true });

const STEPS = 60;
const STEP_MS = 16;
/** Script time on this machine's software WebGL ranges 6-12 s with the cache
 * and barely more without it, so it only bounds a gross regression. */
const SCRIPT_BUDGET_S = 30;
/** The grades worked out during the drag (a development build counts them):
 * about 20 with the per-section cache, over 12,000 when every render
 * recomputes them. Independent of the machine's speed. */
const GRADE_WORK_BUDGET = 200;

test("dragging the radius stays cheap in script time", async ({
  page,
  isMobile,
}) => {
  test.skip(
    isMobile,
    "the phone sheet shows few rows, so its drag is bound by map drawing",
  );
  test.setTimeout(120_000);
  await page.goto("/?mode=area&lat=46.85&lon=10.9&radius=10");
  await appReady(page);
  const slider = page.getByRole("slider", { name: "Radius" });
  await expect(slider).toBeVisible();
  // Let the first list and map paint settle before measuring.
  await page.waitForTimeout(3000);
  const box = await page.locator(".MuiSlider-root").first().boundingBox();
  if (!box) throw new Error("no slider box");
  const xAt = (km: number) => box.x + 14 + ((km - 1) / 199) * (box.width - 28);
  const y = box.y + box.height / 2;
  const path: number[] = [];
  for (let i = 0; i <= STEPS / 2; i++) path.push(10 + (90 * i) / (STEPS / 2));
  for (let i = STEPS / 2; i >= 0; i--) path.push(10 + (90 * i) / (STEPS / 2));

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const script = async () => {
    const { metrics } = await cdp.send("Performance.getMetrics");
    return metrics.find((m) => m.name === "ScriptDuration")?.value ?? 0;
  };
  const before = await script();
  const workedBefore = await page.evaluate(
    () =>
      (window as unknown as { __paddlemateGradeWork?: number })
        .__paddlemateGradeWork ?? 0,
  );
  if (isMobile) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: xAt(10), y }],
    });
    for (const km of path) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: xAt(km), y }],
      });
      await page.waitForTimeout(STEP_MS);
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  } else {
    await page.mouse.move(xAt(10), y);
    await page.mouse.down();
    for (const km of path) {
      await page.mouse.move(xAt(km), y);
      await page.waitForTimeout(STEP_MS);
    }
    await page.mouse.up();
  }
  const spent = (await script()) - before;
  const worked = await page.evaluate(
    () =>
      (window as unknown as { __paddlemateGradeWork?: number })
        .__paddlemateGradeWork ?? 0,
  );
  expect(
    worked - workedBefore,
    "grades worked out during the drag",
  ).toBeLessThan(GRADE_WORK_BUDGET);

  expect(spent, "script seconds spent on the drag").toBeLessThan(
    SCRIPT_BUDGET_S,
  );
});
