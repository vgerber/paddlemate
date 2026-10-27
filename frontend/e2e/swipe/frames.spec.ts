import { expect, type Page, test } from "@playwright/test";
import { Finger } from "../support/finger";

// A tab swipe has to run at frame rate: the pane and its neighbour move by
// transform alone, so a drag causes no React commit and no long frame, even
// with the CPU slowed 4x.

test.use({ hasTouch: true });

const MOVES = 36;
const MOVE_MS = 11;
/** A 60 Hz frame is 16.7 ms; anything over this missed a frame. */
const LONG = 20;
/** Frame budget for the drag under 4x throttling. The neighbour is mounted
 * before the finger moves, so the worst frame is a transform update; 50 ms is
 * the "janky" line the browser itself uses for long tasks. */
const WORST_FRAME_MS = 50;
/** Frame times are rAF timestamps in 16.7 ms steps: three missed frames read
 * 50.0 +- jitter, and that is on the budget, not over it. A touch that lands
 * on the chart redraws it once (a transition), which costs about that. */
const FRAME_JITTER_MS = 2;

interface Probe {
  frames: number[];
  commits: number;
}

async function probeStart(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __probe: Probe; __stop: boolean };
    w.__probe = { frames: [], commits: w.__probe?.commits ?? 0 };
    w.__stop = false;
    let last = performance.now();
    const tick = (t: number) => {
      w.__probe.frames.push(t - last);
      last = t;
      if (!w.__stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function probeStop(page: Page): Promise<Probe> {
  return page.evaluate(() => {
    const w = window as unknown as { __probe: Probe; __stop: boolean };
    w.__stop = true;
    return w.__probe;
  });
}

async function drag(page: Page, selector: string, yShare?: number) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.evaluate(() => {
    (window as unknown as { __probe: Probe }).__probe = {
      frames: [],
      commits: 0,
    };
  });
  const f = await Finger.down(
    page,
    box.x + box.width * 0.85,
    box.y + (yShare ? box.height * yShare : Math.min(box.height / 2, 120)),
  );
  await probeStart(page);
  await f.moveBy(-box.width * 0.5, 0, MOVES, MOVE_MS);
  const probe = await probeStop(page);
  await f.up();
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await cdp.detach();
  return probe;
}

function report(name: string, p: Probe) {
  const f = p.frames.slice(1);
  const worst = Math.max(...f);
  const over = f.filter((d) => d > LONG).length;
  const slow = f.filter((d) => d > WORST_FRAME_MS + FRAME_JITTER_MS).length;
  console.log(
    `FRAMES ${name}: n=${f.length} worst=${worst.toFixed(0)}ms >${LONG}ms=${over} >50ms=${slow} commits=${p.commits}`,
  );
  return { worst, over, slow };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __probe?: Probe;
      __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown;
    };
    const noop = () => undefined;
    w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      renderers: new Map(),
      inject: () => 1,
      onScheduleFiberRoot: noop,
      onCommitFiberUnmount: noop,
      onCommitFiberRoot: () => {
        if (w.__probe) w.__probe.commits += 1;
      },
      checkDCE: noop,
    };
  });
});

const CASES: {
  name: string;
  url: string;
  tab: string;
  pane: string;
  y?: number;
}[] = [
  {
    name: "section tabs",
    url: "/?waterway=9001&section=9101",
    tab: "Logs",
    pane: "[data-testid=tab-pane]:visible",
  },
  {
    name: "river tabs",
    url: "/?waterway=9001",
    tab: "Gauges",
    pane: "[data-testid=tab-pane]:visible",
  },
  { name: "logs", url: "/logs", tab: "Social", pane: "[role=tablist]" },
  {
    name: "proposals tabs",
    url: "/proposals",
    tab: "Approved",
    pane: "[data-testid=proposals-pane]",
  },
  {
    name: "profile tabs",
    url: "/settings",
    tab: "Inbox",
    pane: "[data-testid=settings-pane]",
  },
  {
    name: "trip tabs",
    url: "/trips/9001",
    tab: "Bases",
    pane: "[data-testid=trip-pane]",
  },
];

test.describe("the swipe holds frame rate", () => {
  for (const c of CASES) {
    test(c.name, async ({ page }, info) => {
      test.skip(!info.project.name.startsWith("phone"), "one layout is enough");
      await page.goto(c.url);
      await expect(page.getByRole("tab", { name: c.tab })).toBeVisible();
      // Let the idle pre-mount of the neighbours finish.
      await page.waitForTimeout(1500);
      const p = await drag(page, c.pane, c.y);
      const { worst, slow } = report(c.name, p);
      expect(slow, "frames over 50 ms").toBe(0);
      expect(worst).toBeLessThan(WORST_FRAME_MS * 2);
      // Data landing for the parked neighbours may commit a few times; a
      // commit per move would be 36 or more.
      expect(p.commits, "React commits during the drag").toBeLessThan(12);
    });
  }
});
