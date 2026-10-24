import { expect, test } from "@playwright/test";
import { appReady } from "../support/fixture";

// Dragging the Area radius re-renders the section rows on every step. A row's
// grade and length are worked out from the section line, so recomputing them
// per render turns a drag into seconds of script. The drag runs with the CPU
// slowed 4x; the script time it costs must stay under a bound.

test.use({ hasTouch: true });

const STEPS = 60;
const STEP_MS = 16;
/** Cached rows measure about 17 s on the desktop project, recomputing per
 * render about 40 s (ScriptDuration counts the throttled time). */
const SCRIPT_BUDGET_S = 28;

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
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const before = await script();
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
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });

  expect(spent, "script seconds spent on the drag").toBeLessThan(
    SCRIPT_BUDGET_S,
  );
});
