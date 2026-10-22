import { expect, type Locator, type Page, test } from "@playwright/test";
import { appReady } from "../support/fixture";

// The phone grid (doc/design.md, "The phone grid"): every text starts on the
// 28 line, every value ends 28 from the right edge, names after an icon start
// on the 68 line, and the FAB never covers the last row. A screen that still
// breaks the grid is a `test.fail` naming what it needs; whoever fixes it
// removes the `fail`.

test.skip(({ viewport }) => (viewport?.width ?? 0) >= 768, "phone layout only");

const LINE = 28;
const NAME_LINE = 68;
const TOLERANCE = 1;

const byId = (page: Page, id: string) =>
  page.getByTestId(id).filter({ visible: true });

const tab = (page: Page, name: string) =>
  page
    .getByRole("tab", { name, exact: true })
    .filter({ visible: true })
    .first();

/** Where the first text inside the element starts, and the last ends. */
async function textSpan(loc: Locator) {
  await loc.first().waitFor({ state: "visible" });
  return loc.first().evaluate((el) => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let left = Number.POSITIVE_INFINITY;
    let right = 0;
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.textContent?.trim()) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      const b = r.getBoundingClientRect();
      if (b.width === 0) continue;
      left = Math.min(left, b.left);
      right = Math.max(right, b.right);
    }
    return { left, right };
  });
}

/** The right edge of the row's outermost content box, for a value that is a
 * chip: its border, not its text, sits on the line. */
const contentRight = (loc: Locator) =>
  loc.first().evaluate((el) => {
    let right = 0;
    for (const c of el.querySelectorAll("*")) {
      const r = c.getBoundingClientRect();
      if (r.width > 0) right = Math.max(right, r.right);
    }
    return right;
  });

const viewportWidth = (page: Page) =>
  page.evaluate(() => document.documentElement.clientWidth);

async function expectLeft(loc: Locator, line: number, name: string) {
  const { left } = await textSpan(loc);
  expect(
    Math.abs(left - line),
    `${name} starts on ${line}`,
  ).toBeLessThanOrEqual(TOLERANCE);
}

async function expectRight(page: Page, loc: Locator, name: string) {
  const { right } = await textSpan(loc);
  const want = (await viewportWidth(page)) - LINE;
  expect(
    Math.abs(right - want),
    `${name} ends on ${want}, got ${right}`,
  ).toBeLessThanOrEqual(TOLERANCE);
}

/** Scrolls everything that can scroll to its end, then checks that the FAB
 * sits clear of the last row. */
async function expectFabClear(page: Page, last: Locator, name: string) {
  const fab = page.locator(".MuiFab-root").filter({ visible: true }).first();
  await fab.waitFor({ state: "visible" });
  await last.first().evaluate((el) => {
    for (
      let n: HTMLElement | null = el as HTMLElement;
      n;
      n = n.parentElement
    ) {
      if (n.scrollHeight > n.clientHeight) n.scrollTop = n.scrollHeight;
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await page.waitForTimeout(300);
  const row = await last.first().boundingBox();
  const f = await fab.boundingBox();
  if (!row || !f) throw new Error(`${name}: no boxes`);
  expect(
    row.y + row.height,
    `${name}: last row ends above the FAB`,
  ).toBeLessThanOrEqual(f.y);
}

test.describe("phone grid @small", () => {
  test("river list rows", async ({ page }) => {
    await page.goto("/?waterway=9001");
    await appReady(page);
    const row = page
      .getByRole("button", { name: /Upper Test/ })
      .filter({ visible: true });
    await expectLeft(row, LINE, "section name");
    const want = (await viewportWidth(page)) - LINE;
    const dry = page
      .getByRole("button", { name: /Dry Test/ })
      .filter({ visible: true });
    for (const r of [row, dry]) {
      expect(
        Math.abs((await contentRight(r)) - want),
        "level chip ends on the right line",
      ).toBeLessThanOrEqual(TOLERANCE);
    }
  });

  test("panel header", async ({ page }) => {
    await page.goto("/?waterway=9001&section=9101");
    await appReady(page);
    await expectLeft(tab(page, "Features"), LINE, "first tab");
    const title = page.getByRole("heading", { name: "Upper Test" }).filter({
      visible: true,
    });
    await expectLeft(title, NAME_LINE, "title after the back arrow");
    const back = page
      .getByRole("button", { name: "Back" })
      .filter({ visible: true })
      .first();
    const box = await back.boundingBox();
    // The 44 box around a 22 icon: the icon starts on the 28 line.
    expect(
      Math.abs((box?.x ?? 0) + 11 - LINE),
      "back icon",
    ).toBeLessThanOrEqual(TOLERANCE);
  });

  test("section tabs", async ({ page }) => {
    await page.goto("/?waterway=9001&section=9101");
    await appReady(page);
    await expectLeft(byId(page, "features-count"), LINE, "feature count");
    await tab(page, "Logs").click();
    await expectLeft(byId(page, "section-log"), LINE, "section log");
    await expectRight(page, byId(page, "section-log"), "section log value");
  });

  test("logs list", async ({ page }) => {
    await page.goto("/logs");
    const cards = byId(page, "descent-card");
    await expectLeft(cards, LINE, "log title");
    await expectRight(page, cards, "log meta");
    await expectFabClear(page, cards.last(), "logs");
  });

  test("trips list", async ({ page }) => {
    await page.goto("/trips");
    const cards = byId(page, "trip-card");
    await expectLeft(cards, LINE, "trip name");
    await expectFabClear(page, cards.last(), "trips");
  });

  test("proposals list", async ({ page }) => {
    await page.goto("/proposals?status=pending");
    const cards = byId(page, "proposal-card");
    await expectLeft(cards, LINE, "proposal title");
    await expectRight(page, cards, "proposal meta");
  });

  test("section features keep clear of the FAB", async ({ page }) => {
    await page.goto("/?waterway=9001&section=9101");
    await appReady(page);
    await expectFabClear(
      page,
      page.locator("[data-row]").filter({ visible: true }).last(),
      "features",
    );
  });

  test("trip plan names sit on the name line", async ({ page }) => {
    test.fail(
      true,
      "Trip plan: days are flat on the ground and rows put the icon at 20, so names start on 60; needs day cards and the 28/68 icon column.",
    );
    await page.goto("/trips/9001?edit=false");
    await expectLeft(byId(page, "plan-day").first(), LINE, "day");
    await expectLeft(
      byId(page, "plan-day").first().getByText("Arrives").first(),
      NAME_LINE,
      "plan row name",
    );
  });

  test("settings, inbox and tools", async ({ page }) => {
    test.fail(
      true,
      "Settings: Inbox rows start at 46 (icon column) and Tools rows at 80 (40 tile); both need the 28/12 icon column and the right line.",
    );
    await page.goto("/settings");
    await tab(page, "Inbox").click();
    await expectLeft(
      page.locator(".MuiListItemButton-root").filter({ visible: true }),
      NAME_LINE,
      "inbox name",
    );
    await tab(page, "Tools").click();
    await expectLeft(
      page
        .locator('a[href^="/tools"]')
        .filter({ visible: true })
        .first()
        .getByText("Proposals"),
      NAME_LINE,
      "tool name",
    );
  });
});

test.describe("phone grid, river and section @small", () => {
  const LOWER = "/?waterway=9001&section=9102";
  const SLOT = 44;
  const TRAIL_INSET = 10;

  test("feature discs and rail share one column, values one line", async ({
    page,
  }) => {
    await page.goto(LOWER);
    await appReady(page);
    const rows = page.locator("[data-row]").filter({ visible: true });
    await rows.first().waitFor();
    const count = await rows.count();
    expect(count, "put-in, a group and its members").toBeGreaterThan(4);
    const geo = await page.evaluate(() => {
      const box = (el: Element) => el.getBoundingClientRect();
      return [...document.querySelectorAll("[data-row]")].map((row) => {
        const disc = box(row.querySelector("[data-row-disc]") as Element);
        const rail = row.querySelector("[data-rail]");
        const km = row.querySelector("[data-km]");
        const name = row.querySelector("span:not([data-km])");
        const badge = row.querySelectorAll(
          "[data-row-disc] > div[aria-hidden]",
        );
        return {
          disc: disc.left + disc.width / 2,
          rail: rail ? box(rail).left + 1 : null,
          km: km ? box(km).right : null,
          name: name ? box(name).left : null,
          badge: [...badge].filter(
            (b) => getComputedStyle(b).display !== "none",
          ).length,
        };
      });
    });
    const vw = await viewportWidth(page);
    for (const g of geo) {
      expect(Math.abs(g.disc - (LINE + 14)), "disc centre").toBeLessThanOrEqual(
        TOLERANCE,
      );
      if (g.rail != null) {
        expect(Math.abs(g.rail - (LINE + 14)), "rail line").toBeLessThanOrEqual(
          TOLERANCE,
        );
      }
      expect(g.badge, "no chevron badge on the tile").toBe(0);
      if (g.name != null) {
        expect(Math.abs(g.name - NAME_LINE), "name").toBeLessThanOrEqual(
          TOLERANCE,
        );
      }
      if (g.km != null) {
        const want = vw - LINE - (SLOT - TRAIL_INSET);
        expect(
          Math.abs(g.km - want),
          "value ends before the slot",
        ).toBeLessThanOrEqual(TOLERANCE);
      }
    }
    const chevron = page
      .locator("[data-trail-slot] svg")
      .filter({ visible: true });
    const box = await chevron.first().boundingBox();
    expect(
      box && Math.abs(box.x + box.width - (vw - LINE)),
      "chevron ends on the right line",
    ).toBeLessThanOrEqual(TOLERANCE);
  });

  test("sources and edits sit on the 28 and 68 lines", async ({ page }) => {
    await page.goto(LOWER);
    await appReady(page);
    await tab(page, "Sources").click();
    const rows = byId(page, "source-row");
    const tile = await rows.first().evaluate((el) => {
      const r =
        el.firstElementChild?.firstElementChild?.getBoundingClientRect();
      return { left: r?.left ?? 0, width: r?.width ?? 0 };
    });
    expect(tile.left, "source icon tile starts on 28").toBe(LINE);
    expect(tile.width, "tile is the 28 icon column").toBe(28);
    const name = rows.first().getByText("Imported from Rivermap");
    await expectLeft(name, NAME_LINE, "source name");
    await expectLeft(byId(page, "history-step"), NAME_LINE, "edit title");
    const dot = await page
      .getByTestId("history-dot")
      .filter({ visible: true })
      .first()
      .boundingBox();
    expect(
      dot && Math.abs(dot.x + dot.width / 2 - (LINE + 14)),
    ).toBeLessThanOrEqual(TOLERANCE);
  });

  test("an empty notes tab keeps its caption on the 28 lines", async ({
    page,
  }) => {
    await page.goto("/?waterway=9001&section=9101");
    await appReady(page);
    await tab(page, "Notes").click();
    const caption = byId(page, "empty-state").getByText("Hazards, conditions");
    // Centred text: the line may start inside the 28 line, never outside it.
    const { left, right } = await textSpan(caption);
    expect(left, "caption keeps inside the left line").toBeGreaterThanOrEqual(
      LINE - TOLERANCE,
    );
    expect(right, "caption keeps inside the right line").toBeLessThanOrEqual(
      (await viewportWidth(page)) - LINE + TOLERANCE,
    );
  });

  test("chart words and dates sit on the 28 line", async ({ page }) => {
    await page.goto(LOWER);
    await appReady(page);
    const word = byId(page, "threshold-label");
    await expectLeft(word, LINE, "threshold word");
    await expectLeft(
      page.locator("svg text").filter({ hasText: /^[A-Z][a-z]{2} \d+$/ }),
      LINE,
      "first axis date",
    );
  });
});
