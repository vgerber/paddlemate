import { expect, type Locator, type Page, test } from "@playwright/test";
import { Finger } from "../support/finger";
import {
  expectNoHorizontalOverflow,
  expectTouchTargets,
  FIX,
} from "../support/fixture";

// WP8: trips (doc/plans/ui-overhaul.md). Trip 9001 "Oetztal week" has four
// members and days before and after today, so the plan spans two weeks.

const TRIP = FIX.trips[0];

/** The native input behind a PickerField (the visible text field shares its label). */
const pickerInput = (page: Page, label: string) =>
  page.locator(`input[aria-label="${label}"]`);

const strip = (page: Page) =>
  page.getByTestId("week-strip").filter({ visible: true });
const dayCards = (page: Page) =>
  page.getByTestId("plan-day").filter({ visible: true });
const scroller = (page: Page) =>
  page.getByTestId("plan-scroll").filter({ visible: true });
const monthGrid = (page: Page) =>
  page.getByTestId("month-grid").filter({ visible: true });

async function openPlan(page: Page) {
  await page.goto(`/trips/${TRIP}`);
  await expect(dayCards(page).first()).toBeVisible();
}

/** The pinned week and its month are the phone's calendar; the desktop card
 * has the row of day cells instead. */
async function openPhonePlan(page: Page) {
  test.skip(test.info().project.name === "desktop", "phone calendar");
  await openPlan(page);
}

async function openList(page: Page) {
  await page.goto("/trips");
  await expect(page.getByTestId("trip-card").first()).toBeVisible();
}

test.describe("trip list", () => {
  test("cards carry name, dates, avatars and sit as cards", async ({
    page,
  }) => {
    await openList(page);
    const card = page
      .getByTestId("trip-card")
      .filter({ hasText: "Oetztal week" });
    await expect(card).toContainText(/\d{2}.* 2026/);
    await expect(card.getByTestId("member-avatar")).toHaveCount(4);
    const style = await card.evaluate((el) => {
      const s = getComputedStyle(el);
      return { radius: s.borderRadius, shadow: s.boxShadow };
    });
    expect(style.radius).toBe("14px");
    expect(style.shadow).not.toBe("none");
    await expect(page.getByRole("button", { name: "New trip" })).toBeVisible();
  });

  test("desktop opens the trip beside the list", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop");
    // Wide enough that the list and the trip card both stay open.
    await page.setViewportSize({ width: 1440, height: 900 });
    await openList(page);
    await expect(page.getByText(/\d+ results?/)).toBeVisible();
    const first = page.getByTestId("trip-card").first();
    const name = (await first.innerText()).split("\n")[0];
    await first.click();
    await expect(page).toHaveURL(/selected=/);
    // The open trip is the one card: it names the trip, the list is gone,
    // and the back arrow returns to it.
    const trip = page.getByTestId("canvas-card-trip");
    await expect(trip.getByRole("heading", { name })).toHaveCount(1);
    await expect(
      trip.getByRole("tab", { name: "Plan", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("canvas-card-list")).toHaveCount(0);
    await expect(trip.getByTestId("trip-week-day").first()).toBeVisible();
    await trip.getByRole("button", { name: "Back" }).click();
    await expect(page).not.toHaveURL(/selected=/);
    await expect(trip).toHaveCount(0);
    await expect(page.getByTestId("trip-card").first()).toBeVisible();
  });

  test("no sideways scroll @small", async ({ page }) => {
    await openList(page);
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("trip plan", () => {
  test("the plan scrolls inside the card, header and tabs stay", async ({
    page,
  }) => {
    await openPlan(page);
    const box = scroller(page);
    const fits = await box.evaluate((el) => el.scrollHeight <= el.clientHeight);
    test.skip(fits, "plan fits the window");
    const bb = await box.boundingBox();
    if (!bb) throw new Error("no plan box");
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.mouse.wheel(0, 400);
    await expect
      .poll(() => box.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    await expect(page.getByRole("tab", { name: "Plan" })).toBeInViewport();
  });

  test("past days sit sunk, upcoming days white and outlined", async ({
    page,
  }) => {
    await openPlan(page);
    const look = (card: Locator) =>
      card.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { bg: cs.backgroundColor, shadow: cs.boxShadow };
      });
    const today = await page.evaluate(() =>
      new Date().toLocaleDateString("sv"),
    );
    const dates = await dayCards(page).evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-date") ?? ""),
    );
    const before = dates.find((d) => d < today);
    const after = dates.find((d) => d > today);
    expect(before && after, "fixture spans today").toBeTruthy();
    const a = await look(
      page.locator(`[data-testid=plan-day][data-date="${before}"]:visible`),
    );
    const b = await look(
      page.locator(`[data-testid=plan-day][data-date="${after}"]:visible`),
    );
    expect(a.bg).not.toBe(b.bg);
    expect(a.shadow).toBe("none");
    expect(b.shadow).not.toBe("none");
  });

  test("week strip: seven days, 44px, today marked", async ({ page }) => {
    await openPhonePlan(page);
    const days = strip(page).getByTestId("week-day");
    await expect(days).toHaveCount(7);
    await expectTouchTargets(days);
    await expect(strip(page).locator("[data-today=true]")).toHaveCount(1);
    await expect(strip(page).locator("[data-runs]").first()).toBeVisible();
  });

  test("run marks: one dot per planned run, inside the cell, white when selected @small", async ({
    page,
  }) => {
    await openPhonePlan(page);
    const marks = (cell: Locator) => cell.getByTestId("run-mark");
    const cells = strip(page).getByTestId("week-day");
    const runDays = strip(page).locator("[data-runs]:not([data-runs='0'])");
    await expect(runDays.first()).toBeVisible();

    // Every cell draws exactly as many dots as it has runs, never more than 3.
    for (const cell of await cells.all()) {
      const runs = Number(await cell.getAttribute("data-runs"));
      expect(runs).toBeLessThanOrEqual(3);
      await expect(marks(cell)).toHaveCount(runs);
    }

    // The first day of the plan is selected and has a run: white dots,
    // 5px, 3px apart, centred inside the day's disc.
    const current = strip(page).locator("[data-current=true]");
    const dots = marks(current);
    const n = await dots.count();
    expect(n).toBeGreaterThan(0);
    const disc = await current.getByTestId("day-number").boundingBox();
    const boxes = [];
    for (let i = 0; i < n; i++) {
      await expect(dots.nth(i)).toHaveCSS(
        "background-color",
        "rgb(255, 255, 255)",
      );
      const b = await dots.nth(i).boundingBox();
      if (!b || !disc) throw new Error("no box");
      expect(b.width).toBe(5);
      expect(b.height).toBe(5);
      expect(b.y).toBeGreaterThanOrEqual(disc.y);
      expect(b.y + b.height).toBeLessThanOrEqual(disc.y + disc.height);
      if (i > 0) expect(b.x - (boxes[i - 1].x + 5)).toBeCloseTo(3, 0);
      boxes.push(b);
    }
    if (disc) {
      const mid = (boxes[0].x + boxes[n - 1].x + 5) / 2;
      expect(Math.abs(mid - (disc.x + disc.width / 2))).toBeLessThan(1);
    }

    // An unselected run day keeps grey dots.
    const other = strip(page)
      .locator("[data-current=false]:not([data-runs='0'])")
      .first();
    await expect(marks(other).first()).not.toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );

    await expectNoHorizontalOverflow(page);
  });

  test("a day without runs has no marks, in the week and the month", async ({
    page,
  }) => {
    await openPhonePlan(page);
    await page.getByRole("button", { name: "Show the month" }).click();
    const today = monthGrid(page).locator("[data-today=true]");
    // Today in the fixture is a base change: something on it, but no run.
    await expect(today).toHaveAttribute("data-runs", "0");
    await expect(today.getByTestId("run-mark")).toHaveCount(0);
    await expect(
      monthGrid(page).locator("[data-runs]:not([data-runs='0'])").first(),
    ).toBeVisible();
    for (const cell of await monthGrid(page).getByTestId("week-day").all()) {
      await expect(cell.getByTestId("run-mark")).toHaveCount(
        Number(await cell.getAttribute("data-runs")),
      );
    }
  });

  test("the handle sits clear of the day row", async ({ page }) => {
    await openPhonePlan(page);
    const cell = await strip(page)
      .getByTestId("week-day")
      .first()
      .boundingBox();
    const bar = await page
      .getByRole("button", { name: "Show the month" })
      .locator("div")
      .first()
      .boundingBox();
    if (!cell || !bar) throw new Error("no box");
    expect(bar.y - (cell.y + cell.height)).toBeGreaterThanOrEqual(12);
  });

  test("strip stays pinned while the days scroll", async ({ page }) => {
    await openPhonePlan(page);
    const before = await strip(page).boundingBox();
    await scroller(page).evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const after = await strip(page).boundingBox();
    expect(after?.y).toBe(before?.y);
    await expect(strip(page).locator("[data-current=true]")).toHaveCount(1);
  });

  test("tapping the handle opens the month, a day scrolls to it", async ({
    page,
  }) => {
    await openPhonePlan(page);
    await page.getByRole("button", { name: "Show the month" }).click();
    const grid = monthGrid(page);
    await expect(grid).toBeVisible();
    await expect(grid).toContainText(/[A-Z][a-z]+ 20\d\d/);
    const target = await dayCards(page).last().getAttribute("data-date");
    await grid.locator(`[data-date="${target}"]`).click();
    await expect(grid).toBeHidden();
    await expect
      .poll(async () => {
        const s = await scroller(page).boundingBox();
        const c = await dayCards(page).last().boundingBox();
        return !!s && !!c && c.y >= s.y - 2 && c.y + 10 <= s.y + s.height;
      })
      .toBe(true);
    await expect(
      strip(page).locator(`[data-date="${target}"][data-current=true]`),
    ).toHaveCount(1);
  });

  test("pulling the handle down opens the month", async ({ page }) => {
    await openPhonePlan(page);
    const h = await page
      .getByRole("button", { name: "Show the month" })
      .boundingBox();
    if (!h) throw new Error("no handle");
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2 + 80, {
      steps: 8,
    });
    await page.mouse.up();
    await expect(monthGrid(page)).toBeVisible();
  });

  test("dates and day labels carry no capitals styling", async ({ page }) => {
    await openPlan(page);
    await expect(dayCards(page).first()).toContainText(/Day -?\d/);
    const bad = await page.locator("body *").evaluateAll((els) =>
      els
        .filter((el) => {
          const s = getComputedStyle(el);
          return (
            (el.textContent ?? "").trim() !== "" &&
            (s.textTransform === "uppercase" ||
              (Number.parseFloat(s.letterSpacing) > 0.5 &&
                el.children.length === 0))
          );
        })
        .map((el) => (el.textContent ?? "").slice(0, 30)),
    );
    expect(bad).toEqual([]);
  });

  test("no sideways scroll, targets 44px @small", async ({ page }) => {
    await openPhonePlan(page);
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(strip(page).getByTestId("week-day"));
  });

  test("tabs swipe", async ({ page }, info) => {
    test.skip(info.project.name === "desktop");
    await openPlan(page);
    const pane = page.getByTestId("trip-pane").filter({ visible: true });
    const box = await pane.boundingBox();
    if (!box) throw new Error("no pane");
    const f = await Finger.down(
      page,
      box.x + box.width * 0.8,
      box.y + box.height / 2,
    );
    await f.moveBy(-box.width * 0.55);
    await f.up();
    await expect(
      page.getByRole("tab", { name: "Bases", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("members and invite", () => {
  test("member rows are cards with avatar, role chip and one menu", async ({
    page,
  }) => {
    await page.goto(`/trips/${TRIP}`);
    await page.getByRole("tab", { name: "Members", exact: true }).click();
    const rows = page.getByTestId("member-row").filter({ visible: true });
    await expect(rows).toHaveCount(4);
    for (const r of await rows.all()) {
      expect((await r.boundingBox())?.height).toBeGreaterThanOrEqual(48);
      await expect(r.getByTestId("member-avatar")).toBeVisible();
      await expect(r.getByTestId("member-role")).toBeVisible();
    }
    await expectTouchTargets(
      rows.first().getByRole("button", { name: /Actions for/ }),
    );
    await expectNoHorizontalOverflow(page);
  });

  test("the invite card shows the link and a copy button", async ({ page }) => {
    await page.goto(`/trips/${TRIP}`);
    await page.getByRole("tab", { name: "Members", exact: true }).click();
    await page.getByRole("button", { name: "Add member" }).click();
    await page.getByRole("button", { name: "New link" }).click();
    const card = page.getByTestId("invite-card");
    await expect(card).toContainText("/invite/");
    await expect(card.getByRole("button", { name: "Copy link" })).toBeVisible();
    // Put it back: withdraw the link created here.
    await page.getByRole("button", { name: "Link actions" }).first().click();
    await page.getByRole("menuitem", { name: "Withdraw link" }).click();
    await page.getByRole("button", { name: "Withdraw", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Link actions" }),
    ).toHaveCount(0);
  });
});

const CARD_RADIUS = "14px";

async function cardStyle(row: Locator) {
  return row.evaluate((el) => {
    const s = getComputedStyle(el);
    return { radius: s.borderRadius, shadow: s.boxShadow };
  });
}

async function openTab(page: Page, name: string) {
  await page.goto(`/trips/${TRIP}`);
  await page.getByRole("tab", { name, exact: true }).click();
}

test.describe("bases and candidates", () => {
  test("base rows are cards with a 44px menu", async ({ page }) => {
    await openTab(page, "Bases");
    const rows = page.getByTestId("stay-row").filter({ visible: true });
    await expect(rows.first()).toBeVisible();
    for (const r of await rows.all()) {
      expect((await r.boundingBox())?.height).toBeGreaterThanOrEqual(48);
      const style = await cardStyle(r);
      expect(style.radius).toBe(CARD_RADIUS);
      expect(style.shadow).not.toBe("none");
    }
    await expectTouchTargets(
      rows.first().getByRole("button", { name: "Base actions" }),
    );
    await expectNoHorizontalOverflow(page);
  });

  test("candidate rows are cards with a menu and 44px votes", async ({
    page,
  }) => {
    await openTab(page, "Bases");
    const rows = page.getByTestId("candidate-row").filter({ visible: true });
    await expect(rows).toHaveCount(2);
    for (const r of await rows.all()) {
      expect((await r.boundingBox())?.height).toBeGreaterThanOrEqual(48);
      const style = await cardStyle(r);
      expect(style.radius).toBe(CARD_RADIUS);
      expect(style.shadow).toBe("none");
      await expectTouchTargets(r.getByRole("button", { name: /^Actions for/ }));
      await expectTouchTargets(r.getByRole("button", { name: /^Vote / }));
    }
    await expectNoHorizontalOverflow(page);
  });

  test("a vote is pressed and taken back", async ({ page }) => {
    await openTab(page, "Bases");
    const row = page
      .getByTestId("candidate-row")
      .filter({ visible: true, hasText: "Haus Wildspitze" });
    const against = row.getByRole("button", { name: /^Vote against/ });
    await expect(against).toHaveAttribute("aria-pressed", "false");
    await against.click();
    await expect(against).toHaveAttribute("aria-pressed", "true");
    await against.click();
    await expect(against).toHaveAttribute("aria-pressed", "false");
  });

  test("logs tab opens with a count @small", async ({ page }) => {
    await openTab(page, "Logs");
    await expect(page.getByText(/^\d+ results?$/).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("trip forms", () => {
  async function expectFormFields(page: Page) {
    const sizes = await page
      .locator(
        "input:visible:not([aria-hidden]):not([type=date]):not([type=time]), textarea:visible, [role=combobox]:visible",
      )
      .evaluateAll((els) =>
        els.map((el) => ({
          font: getComputedStyle(el).fontSize,
          h: Math.round(
            el.closest(".MuiInputBase-root")?.getBoundingClientRect().height ??
              0,
          ),
        })),
      );
    expect(sizes.length).toBeGreaterThanOrEqual(2);
    for (const s of sizes) {
      expect(s.font).toBe("16px");
      expect(s.h).toBeGreaterThanOrEqual(44);
    }
    await expectTouchTargets(page.getByRole("button", { name: "Save trip" }));
    await expectNoHorizontalOverflow(page);
  }

  test("new trip: sections, 16px inputs, 44px controls @small", async ({
    page,
  }) => {
    await page.goto("/trips/new");
    await expect(page.getByLabel("Trip name")).toBeVisible();
    await expect(page.getByTestId("form-section-label")).toHaveCount(3);
    await expect(
      page.getByRole("button", { name: "Save trip" }),
    ).toBeDisabled();
    await expectFormFields(page);
  });

  test("edit trip saves a change and puts it back @small", async ({ page }) => {
    await page.goto(`/trips/${TRIP}?edit=true`);
    const name = page.getByLabel("Trip name");
    await expect(name).toBeVisible();
    await expectFormFields(page);
    const old = await name.inputValue();
    await name.fill(`${old} x`);
    await page.getByRole("button", { name: "Save trip" }).click();
    await expect(page).not.toHaveURL(/edit=true/);
    await expect(page.getByText(`${old} x`).first()).toBeVisible();
    await page.goto(`/trips/${TRIP}?edit=true`);
    await page.getByLabel("Trip name").fill(old);
    await page.getByRole("button", { name: "Save trip" }).click();
    await expect(page).not.toHaveURL(/edit=true/);
    await expect(page.getByText(`${old} x`)).toHaveCount(0);
  });

  test("desktop: the form sits in the pane, fields in a 720px column, bar at the foot", async ({
    page,
    isMobile,
  }) => {
    test.skip(!!isMobile, "two panes start at md");
    await page.goto("/trips?new=true");
    const panel = page.getByTestId("trip-panel");
    await expect(panel).toBeVisible();
    const name = page.getByLabel("Trip name");
    await expect(name).toBeVisible();
    await expect(page.getByTestId("form-section-label")).toHaveCount(3);
    const [p, f, save] = await Promise.all([
      panel.boundingBox(),
      name
        .locator("xpath=ancestor::div[contains(@class,'MuiFormControl-root')]")
        .boundingBox(),
      page.getByRole("button", { name: "Save trip" }).boundingBox(),
    ]);
    if (!p || !f || !save) throw new Error("no boxes");
    expect(f.width).toBeLessThanOrEqual(720);
    // The field column is centred in the pane.
    expect(
      Math.abs(f.x - p.x - (p.x + p.width - (f.x + f.width))),
    ).toBeLessThan(24);
    // The round action sits in the bar docked at the pane foot.
    expect(save.y + save.height).toBeGreaterThan(p.y + p.height - 40);
    await expectFormFields(page);
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page).not.toHaveURL(/new=true/);
  });

  test("an end before the start blocks saving", async ({ page }) => {
    await page.goto(`/trips/${TRIP}?edit=true`);
    await pickerInput(page, "Ends (optional)").fill("2000-01-01");
    await expect(
      page.getByRole("button", { name: "Save trip" }),
    ).toBeDisabled();
  });
});

test.describe("add member dialog", () => {
  test("tapping a name adds it, a failure keeps it open", async ({
    page,
  }, info) => {
    await page.route("**/trips/*/members", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({
              error: { code: "conflict", message: "Nope.", target: null },
            }),
          })
        : route.continue(),
    );
    await openTab(page, "Members");
    await page.getByRole("button", { name: "Add member" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Add a member").first()).toBeVisible();
    await expect(
      dialog.getByText("Send a link, or add someone already here"),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Add to trip" }),
    ).toHaveCount(0);
    await expectTouchTargets(dialog.getByRole("button", { name: "New link" }));
    if (info.project.name !== "desktop") {
      // A sheet from the bottom edge: rounded top, scrim above.
      await expect(page.getByTestId("sheet-scrim")).toBeVisible();
      await expect(dialog).toHaveCSS("border-top-left-radius", "20px");
    }
    // Nobody is listed until a name is typed.
    await expect(dialog.getByTestId("user-pick")).toHaveCount(0);
    await dialog.getByLabel("Search people").fill("jo");
    await dialog.getByTestId("user-pick").first().click();
    await expect(dialog.getByRole("alert")).toContainText("Nope.");
    await expect(dialog).toBeVisible();
  });

  test("the search asks the server for the typed name", async ({ page }) => {
    const asked: string[] = [];
    page.on("request", (r) => {
      const url = new URL(r.url());
      if (url.pathname.endsWith("/users")) asked.push(url.search);
    });
    await openTab(page, "Members");
    await page.getByRole("button", { name: "Add member" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Search people").fill("jo");
    await expect(dialog.getByTestId("user-pick").first()).toContainText("jo");
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((q) => q.includes("q=jo"))).toBe(true);
  });
});

test.describe("trip fixes", () => {
  test("dates read in the app's format, not the browser's", async ({
    page,
  }) => {
    await page.goto("/trips/new");
    const picker = pickerInput(page, "Starts");
    await expect(picker).toHaveAttribute("type", "date");
    await picker.fill("2026-10-23");
    await expect(page.locator('input[value="Fri, 23 Oct 2026"]')).toHaveCount(
      1,
    );
  });

  test("the logs tab has one primary action and the link lives in the menu", async ({
    page,
  }) => {
    await openTab(page, "Logs");
    const primary = page.getByRole("button", { name: "Log a descent" });
    await expect(primary.filter({ visible: true })).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Link an existing log" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Trip actions" }).click();
    await expect(
      page.getByRole("menuitem", { name: "Link an existing log" }),
    ).toBeVisible();
  });

  test("opening a trip leaves no ?edit=false in the address", async ({
    page,
  }) => {
    await openList(page);
    await page.getByTestId("trip-card").first().click();
    await expect(page).toHaveURL(/\/trips/);
    expect(page.url()).not.toContain("edit=");
  });
});

test.describe("trip gaps", () => {
  test("the week is a pill band with a disc, the handle is a 44px target", async ({
    page,
  }, info) => {
    test.skip(info.project.name === "desktop");
    await openPlan(page);
    const band = strip(page).getByTestId("trip-band").first();
    await expect(band).toHaveCSS("height", "36px");
    await expect(band).toHaveCSS("border-top-left-radius", "18px");
    await expect(strip(page).getByTestId("current-disc")).toHaveCount(1);
    const handle = await page
      .getByRole("button", { name: "Show the month" })
      .boundingBox();
    if (!handle) throw new Error("no handle");
    expect(handle.height).toBeGreaterThanOrEqual(44);
    expect(handle.width).toBeGreaterThanOrEqual(44);
  });

  test("today keeps its ring when it is also the current day", async ({
    page,
  }) => {
    await openPhonePlan(page);
    const today = strip(page).locator("[data-today=true]");
    await today.click();
    await expect(today).toHaveAttribute("data-current", "true");
    const disc = strip(page).getByTestId("current-disc").locator("> div");
    await expect(disc).toHaveCSS("box-shadow", /0px 0px 0px 4px/);
  });

  test("days outside the trip sit back", async ({ page }) => {
    await openPhonePlan(page);
    const first = strip(page).getByTestId("week-day").first();
    await expect(first.getByTestId("day-number")).toHaveCSS("opacity", "0.55");
  });

  test("the open month dims the list and a tap on it closes the month", async ({
    page,
  }) => {
    await openPhonePlan(page);
    await page.getByRole("button", { name: "Show the month" }).click();
    const scrim = page.getByTestId("month-scrim").filter({ visible: true });
    await expect(scrim).toBeVisible();
    await scrim.click({ position: { x: 5, y: 300 } });
    await expect(monthGrid(page)).toBeHidden();
    await expect(scrim).toHaveCount(0);
  });

  test("events read 15px over 13px, kinds in lower case", async ({ page }) => {
    await openPlan(page);
    const card = dayCards(page).filter({ hasText: "Camping Oetztal Arena" });
    await expect(card).toContainText("Based at camp");
    const title = card.getByText("Camping Oetztal Arena", { exact: true });
    await expect(title).toHaveCSS("font-size", "15px");
    await expect(title).toHaveCSS("font-weight", "500");
    await expect(card.getByText("Based at camp")).toHaveCSS(
      "font-size",
      "13px",
    );
  });

  test("the add-a-day picker draws the plan's calendar", async ({ page }) => {
    await openPlan(page);
    await page.getByRole("button", { name: "Plan a day" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByTestId("day-number").first()).toHaveCSS(
      "width",
      "36px",
    );
    await expect(dialog.getByTestId("trip-band").first()).toBeVisible();
  });

  test("the list opens with its count on a phone", async ({ page }, info) => {
    test.skip(info.project.name === "desktop");
    await openList(page);
    await expect(page.getByText(/^\d+ results?$/)).toBeVisible();
  });

  test("a trip card's role is a pill on the quiet fill", async ({ page }) => {
    await openList(page);
    const card = page
      .getByTestId("trip-card")
      .filter({ hasText: "Oetztal week" });
    const pill = card.getByText("Admin", { exact: true });
    await expect(pill).toHaveCSS("border-radius", "999px");
    await expect(pill).toHaveCSS("background-color", "rgb(246, 248, 249)");
  });

  test("member roles use the quiet pill, the bases map stays short", async ({
    page,
  }, info) => {
    await openTab(page, "Members");
    await expect(
      page.getByTestId("member-role").filter({ visible: true }).first(),
    ).toHaveCSS("background-color", "rgb(246, 248, 249)");
    await page.getByRole("tab", { name: "Bases", exact: true }).click();
    if (info.project.name !== "desktop") {
      const map = page
        .locator(".maplibregl-map")
        .filter({ visible: true })
        .first();
      await expect(map).toBeVisible();
      const box = await map.boundingBox();
      expect(box?.height).toBeLessThanOrEqual(200);
    }
  });

  test("new trip on a phone covers the bottom nav, dates side by side @small", async ({
    page,
  }, info) => {
    test.skip(info.project.name === "desktop");
    await page.goto("/trips/new");
    await expect(page.getByLabel("Trip name")).toBeVisible();
    const covered = await page.evaluate(() => {
      const nav = document.querySelector("nav[aria-label=Main]");
      const r = nav?.getBoundingClientRect();
      if (!r) return false;
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + 10);
      return !hit?.closest("nav[aria-label=Main]");
    });
    expect(covered).toBe(true);
    const a = await page.getByLabel("Starts").first().boundingBox();
    const b = await page.getByLabel("Ends (optional)").first().boundingBox();
    expect(a?.y).toBe(b?.y);
    await expectNoHorizontalOverflow(page);
  });

  test("desktop: trip panel, docked action, deep links land in the split", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "desktop");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/trips/${TRIP}`);
    await expect(page).toHaveURL(new RegExp(`/trips\\?selected=${TRIP}`));
    await expect(dayCards(page).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Plan a day" }),
    ).toBeVisible();
    // Nothing floats over the card: the add button is docked and the trip's
    // actions are in its header.
    await expect(page.locator(".MuiFab-root:visible")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Trip actions" }),
    ).toBeVisible();
    const card = page.getByTestId("canvas-card-trip");
    await expect(card).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(card).toHaveCSS("border-radius", "14px");
    await page.goto("/trips/new");
    await expect(page).toHaveURL(/\/trips\?new=true/);
    await expect(page.getByTestId("trip-card").first()).toBeVisible();
    await expect(page.getByLabel("Trip name")).toBeVisible();
  });
});

test.describe("trip actions", () => {
  test("an admin reaches Edit and Delete on every tab", async ({ page }) => {
    await openPlan(page);
    const dial = page
      .getByRole("button", { name: "Trip actions" })
      .filter({ visible: true });
    for (const tab of ["Plan", "Bases", "Members", "Logs"]) {
      await page
        .getByRole("tab", { name: tab, exact: true })
        .filter({ visible: true })
        .click();
      await expect(dial, `${tab} tab`).toBeVisible();
      await expectTouchTargets(dial);
    }
    await dial.click();
    await expect(
      page.getByRole("menuitem", { name: "Delete trip" }),
    ).toBeVisible();
    await page.getByRole("menuitem", { name: "Edit trip" }).click();
    await expect(page).toHaveURL(/edit=true/);
    await expect(page.getByLabel("Trip name")).toBeVisible();
  });
});

const PLACED: [number, number][] = [
  [10.9555, 47.07],
  [10.5688, 47.1412],
  [10.7421, 47.1712],
];

type MapLike = {
  isMoving(): boolean;
  loaded(): boolean;
  project(lngLat: [number, number]): { x: number; y: number };
};

async function openCanvas(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/trips?selected=${TRIP}`);
  await expect(page.getByTestId("canvas-card-trip")).toBeVisible();
  await page.waitForFunction(() => {
    const map = (window as unknown as { __paddlemateMap?: MapLike })
      .__paddlemateMap;
    return !!map && map.loaded() && !map.isMoving();
  });
}

test.describe("trips on the canvas", () => {
  test.skip(({ isMobile }) => isMobile, "wide screens only");

  test("an open trip is one card over the map, the list steps aside", async ({
    page,
  }) => {
    await openCanvas(page, 1440);
    await expect(page.locator(".maplibregl-map")).toHaveCount(1);
    await expect(page.getByTestId("canvas-card-list")).toHaveCount(0);
    const trip = await page.getByTestId("canvas-card-trip").boundingBox();
    if (!trip) throw new Error("no card");
    // 25% of the window (360) clamped to 400.
    expect(Math.abs(trip.width - 400)).toBeLessThanOrEqual(1);
    const week = page.getByTestId("trip-week");
    await expect(week.getByTestId("trip-week-day")).toHaveCount(8);
    await expect(
      week.getByTestId("trip-week-day").filter({ hasText: "3 runs" }).first(),
    ).toBeVisible();
    await expect(page.getByTestId("trip-stays-summary")).toBeVisible();
    await expect(page.getByTestId("trip-members-summary")).toBeVisible();
    // The week fits the card without its own scroll.
    expect(await week.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
  });

  test("every base sits inside the free map area", async ({ page }) => {
    await openCanvas(page, 1440);
    await expect
      .poll(
        async () => {
          const raw = await page
            .getByTestId("canvas-host")
            .getAttribute("data-free");
          const [x, y, w, h] = (raw ?? "").split(",").map(Number);
          const pts = await page.evaluate((places) => {
            const map = (window as unknown as { __paddlemateMap?: MapLike })
              .__paddlemateMap;
            if (!map || map.isMoving()) return null;
            return places.map((p) => map.project(p as [number, number]));
          }, PLACED);
          if (!pts) return "moving";
          const slack = 2;
          const outside = pts.filter(
            (p) =>
              p.x < x - slack ||
              p.x > x + w + slack ||
              p.y < y - slack ||
              p.y > y + h + slack,
          );
          return outside.length === 0 ? "inside" : JSON.stringify(outside);
        },
        { timeout: 8000 },
      )
      .toBe("inside");
  });

  test("the Bases tab has no inline map on the canvas", async ({ page }) => {
    await openCanvas(page, 1440);
    await page.getByRole("tab", { name: "Bases", exact: true }).click();
    await expect(page.getByTestId("stay-row").first()).toBeVisible();
    await expect(page.locator(".maplibregl-map")).toHaveCount(1);
    await expect(
      page.getByTestId("canvas-card-trip").locator(".maplibregl-map"),
    ).toHaveCount(0);
  });

  test("the members card appears at 1600 and not at 1599", async ({ page }) => {
    await openCanvas(page, 1599);
    await expect(page.getByTestId("canvas-card-members")).toHaveCount(0);
    await expect(
      page.getByRole("tab", { name: "Members", exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 1600, height: 900 });
    await expect(page.getByTestId("canvas-card-members")).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Members", exact: true }),
    ).toHaveCount(0);
    // Trip and members fit the 70% budget at 1600, so neither folds.
    await expect(page.getByTestId("canvas-card-list")).toHaveCount(0);
    for (const id of ["trip", "members"]) {
      await expect(page.getByTestId(`canvas-card-${id}`)).not.toHaveAttribute(
        "data-collapsed",
      );
    }
    await expect(page.getByTestId("trip-members-card")).toBeVisible();
  });

  test("a deep link to /trips/<id> lands in the cards", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/trips/${TRIP}`);
    await expect(page).toHaveURL(new RegExp(`/trips\\?selected=${TRIP}`));
    await expect(page.getByTestId("canvas-card-trip")).toBeVisible();
  });

  test("the phone keeps its own screens, no canvas", async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 800 });
    await page.goto(`/trips/${TRIP}`);
    await expect(page.getByTestId("canvas-card-trip")).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Members" })).toBeVisible();
  });
});
