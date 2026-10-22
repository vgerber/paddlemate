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

/** The row's last icon (a menu) ends on the right line. */
async function expectIconRight(page: Page, row: Locator, name: string) {
  const right = await row
    .locator("svg")
    .last()
    .evaluate((el) => el.getBoundingClientRect().right);
  const want = (await viewportWidth(page)) - LINE;
  expect(Math.abs(right - want), `${name} ends on ${want}`).toBeLessThanOrEqual(
    TOLERANCE,
  );
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
    await page.goto("/trips/9001?edit=false");
    const day = byId(page, "plan-day").first();
    await expectLeft(day, LINE, "day");
    await expectRight(page, day, "day date");
    await expectLeft(
      day.getByText("Arrives").first(),
      NAME_LINE,
      "plan row name",
    );
    const radius = await day.evaluate(
      (el) => getComputedStyle(el).borderRadius,
    );
    expect(radius, "a day keeps the card shape").not.toBe("0px");
  });

  test("trip week strip sits on the lines", async ({ page, viewport }) => {
    // Seven 44px cells fill a 320 screen, so the strip cannot hold the line.
    test.skip((viewport?.width ?? 0) < 400, "strip is capped at 320");
    await page.goto("/trips/9001?edit=false");
    const disc = byId(page, "day-number");
    await disc.first().waitFor();
    const box = async (n: number) => disc.nth(n).boundingBox();
    const first = await box(0);
    const last = await box(6);
    expect(
      Math.abs((first?.x ?? 0) - LINE),
      "first day starts on the line",
    ).toBeLessThanOrEqual(TOLERANCE);
    expect(
      Math.abs(
        (last?.x ?? 0) +
          (last?.width ?? 0) -
          ((await viewportWidth(page)) - LINE),
      ),
      "last day ends on the right line",
    ).toBeLessThanOrEqual(TOLERANCE);
  });

  test("trip bases", async ({ page }) => {
    await page.goto("/trips/9001?edit=false");
    await tab(page, "Bases").click();
    const row = byId(page, "stay-row").first();
    await expectLeft(
      row.getByText("Camping Oetztal Arena"),
      NAME_LINE,
      "base name",
    );
    const badge = await row.getByText("1", { exact: true }).boundingBox();
    expect(Math.abs((badge?.x ?? 0) - LINE), "base number").toBeLessThanOrEqual(
      TOLERANCE,
    );
    await expectLeft(byId(page, "form-section-label").first(), LINE, "label");
    await expectIconRight(page, row, "base menu");
    await expectFabClear(page, byId(page, "stay-row").last(), "bases");
  });

  test("trip members", async ({ page }) => {
    await page.goto("/trips/9001?edit=false");
    await tab(page, "Members").click();
    const rows = byId(page, "member-row");
    await expectLeft(rows.first().getByText("mara"), NAME_LINE, "member name");
    const avatar = await byId(page, "member-avatar").first().boundingBox();
    expect(Math.abs((avatar?.x ?? 0) - LINE), "avatar").toBeLessThanOrEqual(
      TOLERANCE,
    );
    for (let n = 0; n < (await rows.count()); n++) {
      await expectIconRight(page, rows.nth(n), `member ${n} menu`);
    }
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
