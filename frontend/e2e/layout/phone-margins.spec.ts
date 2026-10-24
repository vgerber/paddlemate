import { expect, type Locator, type Page, test } from "@playwright/test";
import { seen } from "../support/active";
import { appReady } from "../support/fixture";

// Every card on a phone sits 12 from each screen edge and 8 from the next
// card (doc/design.md, phone spacing), measured against the viewport.

test.skip(({ viewport }) => (viewport?.width ?? 0) >= 768, "phone layout only");

const MARGIN = 12;
const GAP = 8;

async function edges(page: Page, loc: Locator) {
  await loc.first().waitFor({ state: "visible" });
  const vw = await page.evaluate(() => document.documentElement.clientWidth);
  const boxes = await loc.evaluateAll((els) =>
    els
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({ l: r.left, r: r.right, t: r.top, b: r.bottom })),
  );
  expect(boxes.length, "cards found").toBeGreaterThan(0);
  return boxes.map((b) => ({
    left: Math.round(b.l),
    right: Math.round(vw - b.r),
    top: b.t,
    bottom: b.b,
  }));
}

async function expectMargins(page: Page, loc: Locator, name: string) {
  for (const e of await edges(page, loc)) {
    expect(e.left, `${name} left`).toBe(MARGIN);
    expect(e.right, `${name} right`).toBe(MARGIN);
  }
}

const tab = (page: Page, name: string) =>
  page
    .getByRole("tab", { name, exact: true })
    .filter({ visible: true })
    .first();

// The swipe ghost holds the neighbour tab's copy of a list, parked offscreen.
const byId = (page: Page, id: string) => seen(page.getByTestId(id));

test.describe("phone card margins @small", () => {
  test("section tabs", async ({ page }) => {
    await page.goto("/?waterway=9001&section=9101");
    await appReady(page);
    const chart = byId(page, "chart-card");
    const features = byId(page, "features-card");
    await expectMargins(page, chart, "chart");
    await expectMargins(page, features, "features");
    const [c] = await edges(page, chart);
    const [f] = await edges(page, features);
    expect(Math.round(f.top - c.bottom), "gap chart to features").toBe(GAP);
    const state = byId(page, "river-state").locator("> div");
    if (await state.count())
      await expectMargins(page, state.first(), "river state");

    await tab(page, "Logs").click();
    await expectMargins(page, byId(page, "section-log"), "section logs");
    await tab(page, "Sources").click();
    await expectMargins(page, byId(page, "sources"), "sources");
    await expectMargins(page, byId(page, "history"), "history");
    await tab(page, "Notes").click();
    await expectMargins(
      page,
      page.locator(".MuiInputBase-root").filter({ visible: true }).last(),
      "note composer",
    );
  });

  test("river view", async ({ page }) => {
    await page.goto("/?waterway=9001");
    await appReady(page);
    await expectMargins(
      page,
      page
        .getByRole("button", { name: /Upper Test/ })
        .filter({ visible: true }),
      "sections",
    );
    await tab(page, "Gauges").click();
    await expectMargins(page, byId(page, "gauge-card"), "gauges");
    await tab(page, "Notes").click();
    await expectMargins(page, byId(page, "note-card"), "notes");
  });

  test("lists", async ({ page }) => {
    await page.goto("/?panel=1");
    await expectMargins(page, byId(page, "search-section-row"), "search");
    await page.goto("/logs");
    await expectMargins(page, byId(page, "descent-card"), "logs");
    await page.goto("/proposals?status=pending");
    await expectMargins(page, byId(page, "proposal-card"), "proposals");
    await page.goto("/settings");
    await tab(page, "Inbox").click();
    await expectMargins(
      page,
      seen(page.locator(".MuiListItemButton-root")),
      "inbox",
    );
    await tab(page, "Tools").click();
    await expectMargins(page, seen(page.locator('a[href^="/tools"]')), "tools");
  });

  test("trip tabs", async ({ page }) => {
    await page.goto("/trips");
    await expectMargins(page, byId(page, "trip-card"), "trips");
    await page.goto("/trips/9001?edit=false");
    await expectMargins(page, byId(page, "plan-day"), "plan");
    for (const [name, id] of [
      ["Bases", "candidate-row"],
      ["Members", "member-row"],
    ] as const) {
      await tab(page, name).click();
      await expectMargins(page, byId(page, id), name);
    }
  });
});
