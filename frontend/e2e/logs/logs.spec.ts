import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from "@playwright/test";
import {
  computed,
  expectNoHorizontalOverflow,
  expectTouchTargets,
  FIX,
} from "../support/fixture";

// WP9: the logs list, a log, the log descent flow and the standing descent
// banner in the calm design (doc/plans/ui-overhaul/calm-design.html, "Logs and
// a log" and "Log descent"). Fixture: Vincent's descents 9201, 9202 and 9208.

test.use({ hasTouch: true });

const TEAL = "rgb(14, 116, 144)";
const E1_COLOR = "rgba(31, 43, 49, 0.08)";
const API = "http://localhost:3000/api/v1";
const TOKEN = { "X-Api-Key": "pm_testtoken123" };
const TITLE = "WP9 spec run";
const STANDING_KEY = "paddlemate_standing_descent";

const cards = (page: Page) => page.getByTestId("descent-card");
const card = (page: Page, name: string) =>
  cards(page).filter({ hasText: name }).first();
const isDesktop = (info: TestInfo) => info.project.name === "desktop";
const next = (page: Page) => page.getByRole("button", { name: "Next" });

async function openLogs(page: Page) {
  await page.goto("/logs");
  await expect(cards(page).first()).toBeVisible();
}

async function startNewLog(page: Page) {
  await openLogs(page);
  await page.getByRole("button", { name: "Log descent" }).first().click();
  await expect(page).toHaveURL(/\/logs\/new/);
}

/** A new log that already holds a section, so every step can be passed. */
async function startSectionLog(page: Page) {
  await page.goto(
    `/logs/new?waterwayId=${FIX.waterway}&sectionId=${FIX.sections.upper}`,
  );
  await expect(page.getByText("Step 1 of 3 · When")).toBeVisible();
}

/** Removes the rows this spec made, however the test ended. */
async function removeSpecRuns(page: Page) {
  const res = await page.request.get(
    `${API}/descents?scope=owned&per_page=100`,
    { headers: TOKEN },
  );
  if (!res.ok()) return;
  const body = (await res.json()) as { items: { id: number; name?: string }[] };
  for (const d of body.items) {
    if (d.name === TITLE) {
      await page.request.delete(`${API}/descents/${d.id}`, { headers: TOKEN });
    }
  }
}

test.afterEach(async ({ page }) => {
  await removeSpecRuns(page);
});

test.describe("logs list", () => {
  test("a log is a card: radius md, soft shadow, white, no border", async ({
    page,
  }, info) => {
    test.skip(isDesktop(info), "desktop rows are flat");
    await openLogs(page);
    const c = card(page, "Public multi-section run");
    expect(await computed(c, "border-top-left-radius")).toBe("14px");
    expect(await computed(c, "box-shadow")).toContain(E1_COLOR);
    expect(await computed(c, "border-top-width")).toBe("0px");
    expect(await computed(c, "background-color")).toBe("rgb(255, 255, 255)");
  });

  test("cards are separated and at least 56px tall", async ({ page }, info) => {
    test.skip(isDesktop(info), "desktop rows are flat");
    await openLogs(page);
    const boxes = await cards(page).evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, h: r.height };
      }),
    );
    expect(boxes.length).toBeGreaterThanOrEqual(3);
    for (const [i, b] of boxes.entries()) {
      expect(b.h, `card ${i} height`).toBeGreaterThanOrEqual(56);
      if (i > 0) expect(b.top - boxes[i - 1].bottom).toBeGreaterThanOrEqual(4);
    }
  });

  test("sentence case: no capitals, no outlined chips", async ({ page }) => {
    await openLogs(page);
    const bad = await cards(page).evaluateAll((els) =>
      els.flatMap((el) =>
        [el, ...el.querySelectorAll("*")]
          .filter((n) => getComputedStyle(n).textTransform === "uppercase")
          .map((n) => n.textContent?.slice(0, 20) ?? ""),
      ),
    );
    expect(bad).toEqual([]);
    await expect(page.locator(".MuiChip-root")).toHaveCount(0);
    const c = card(page, "Private upper run");
    await expect(c).toContainText("Private");
    await expect(c).not.toContainText("PRIVATE");
  });

  test("the level at the time is a level pill", async ({ page }) => {
    await openLogs(page);
    const pill = card(page, "Public multi-section run").locator("[data-level]");
    await expect(pill.first()).toBeVisible();
  });

  test("the list opens with the count, and months are plain text", async ({
    page,
  }) => {
    await openLogs(page);
    await expect(page.getByText(/^\d+ logs?$/).first()).toBeVisible();
    const month = page.getByTestId("log-month").first();
    expect(await computed(month, "text-transform")).toBe("none");
  });

  test("the primary action is a teal FAB on a phone, docked on desktop", async ({
    page,
  }) => {
    await openLogs(page);
    const action = page.getByRole("button", { name: "Log descent" });
    await expect(action).toBeVisible();
    expect(await computed(action, "background-color")).toBe(TEAL);
  });

  test("two panes on desktop, the log opens in the right one", async ({
    page,
  }, info) => {
    test.skip(!isDesktop(info), "desktop layout");
    await openLogs(page);
    const c = card(page, "Public multi-section run");
    const list = await c.boundingBox();
    await c.click();
    await expect(page).toHaveURL(/\/logs\/\d+/);
    const label = page.getByTestId("fact-label").first();
    await expect(label).toBeVisible();
    const f = await label.boundingBox();
    expect(list && f && f.x > list.x + list.width).toBe(true);
    // The list stays, flat, with the open log on a teal wash and a 3px bar.
    await expect(c).toBeVisible();
    expect(await computed(c, "box-shadow")).toContain(TEAL);
    expect(await computed(c, "box-shadow")).toContain("3px 0px 0px 0px");
    expect(await computed(c, "border-top-left-radius")).toBe("0px");
    expect(await computed(c, "background-color")).not.toBe(
      "rgb(255, 255, 255)",
    );
    // The card runs the full height, with the action docked at its foot
    // instead of scrolling away with the list.
    const pane = await card(page, "Public multi-section run")
      .locator("xpath=ancestor::section")
      .boundingBox();
    const dock = await page
      .getByRole("button", { name: "Log descent" })
      .boundingBox();
    const win = page.viewportSize();
    expect(pane && win && pane.height > win.height - 200).toBe(true);
    expect(dock && win && dock.y + dock.height <= win.height).toBe(true);
  });

  test("a log opens over the list on a phone and back returns", async ({
    page,
  }, info) => {
    test.skip(isDesktop(info), "phone layout");
    await openLogs(page);
    await card(page, "Private upper run").click();
    await expect(page).toHaveURL(/\/logs\/\d+/);
    await expect(cards(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Back" }).click();
    await expect(cards(page).first()).toBeVisible();
  });
});

test.describe("a log", () => {
  test("shows the facts, the sections as a quiet list and the route", async ({
    page,
  }, info) => {
    test.skip(isDesktop(info), "the desktop card has its own test below");
    await openLogs(page);
    await card(page, "Public multi-section run").click();
    const labels = page.getByTestId("fact-label");
    await expect(labels.filter({ hasText: /^Date$/ })).toBeVisible();
    await expect(labels.filter({ hasText: /^Time$/ })).toBeVisible();
    await expect(page.getByText("Sections (2)")).toBeVisible();
    const row = page.getByTestId("log-section").first();
    await expect(row).toContainText("Upper Test");
    // A line in the section card, not a tile of its own.
    expect(await computed(row, "border-top-left-radius")).toBe("0px");
    expect(await computed(row, "box-shadow")).toBe("none");
    await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  });

  test("a section's level shows as a pill", async ({ page }, info) => {
    test.skip(isDesktop(info), "the canvas card names the level in its facts");
    await openLogs(page);
    await card(page, "Public multi-section run").click();
    await expect(
      page.getByTestId("log-section").locator("[data-level]").first(),
    ).toBeVisible();
  });

  test("edit and delete sit in one menu, only on your own log", async ({
    page,
  }) => {
    await openLogs(page);
    await card(page, "Private upper run").click();
    await page.getByRole("button", { name: "Log actions" }).click();
    await expect(page.getByRole("menuitem", { name: "Edit" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
    await page.keyboard.press("Escape");
    // Somebody else's public log has no menu.
    await page.goto("/logs/9203");
    await expect(page.getByTestId("fact-label").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Log actions" })).toHaveCount(
      0,
    );
  });
});

test.describe("log descent", () => {
  const targets = (page: Page) =>
    page.locator("main button:visible, main .MuiInputBase-root:visible");

  test("inputs are 16px on every step", async ({ page }) => {
    await startSectionLog(page);
    for (const step of [0, 1, 2]) {
      const sizes = await page
        .locator("input:visible, textarea:visible")
        .evaluateAll((els) => els.map((e) => getComputedStyle(e).fontSize));
      expect(
        sizes.filter((s) => s !== "16px"),
        `step ${step}`,
      ).toEqual([]);
      if (step < 2) await next(page).click();
    }
  });

  test("when and details reach 44px", async ({ page }) => {
    await startSectionLog(page);
    await expectTouchTargets(targets(page));
    await next(page).click();
    await next(page).click();
    await expectTouchTargets(targets(page));
  });

  test("sections step reaches 44px", async ({ page }) => {
    await startNewLog(page);
    await next(page).click();
    await expectTouchTargets(targets(page));
  });

  test("the chrome is the bottom bar with a rounded teal action", async ({
    page,
  }) => {
    await startNewLog(page);
    await expect(page.getByText("Step 1 of 3 · When")).toBeVisible();
    expect(await computed(next(page), "border-top-left-radius")).toBe("16px");
    expect(await computed(next(page), "background-color")).toBe(TEAL);
    await next(page).click();
    await expect(page.getByText("Step 2 of 3 · Sections")).toBeVisible();
  });

  test("create a log through the UI and delete it again", async ({
    page,
  }, info) => {
    await page.goto(
      `/logs/new?waterwayId=${FIX.waterway}&sectionId=${FIX.sections.upper}`,
    );
    await expect(page.getByText("Step 1 of 3 · When")).toBeVisible();
    await next(page).click();
    await expect(page.getByText("Step 2 of 3 · Sections")).toBeVisible();
    await next(page).click();
    await page.getByLabel("Title").fill(TITLE);
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page).toHaveURL(/\/logs\/\d+/);
    await expect(page.getByText(TITLE).first()).toBeVisible();
    if (isDesktop(info)) await expect(card(page, TITLE)).toBeVisible();

    await page.getByRole("button", { name: "Log actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page).toHaveURL(/\/logs$/);
    await expect(card(page, TITLE)).toHaveCount(0);
  });
});

test.describe("standing descent banner", () => {
  async function standing(page: Page, name = "Upper Test") {
    await page.addInitScript(
      ([k, v]) => localStorage.setItem(k, v),
      [
        STANDING_KEY,
        JSON.stringify({
          startTime: new Date(Date.now() - 600000).toISOString(),
          waterwayId: FIX.waterway,
          sectionId: FIX.sections.upper,
          sectionName: name,
        }),
      ],
    );
    await page.goto("/logs");
  }
  const banner = (page: Page): Locator =>
    page.getByTestId("standing-banner").first();

  test("is a floating card with a teal action", async ({ page }) => {
    await standing(page);
    await expect(banner(page)).toBeVisible();
    expect(await computed(banner(page), "border-top-left-radius")).toBe("14px");
    expect(await computed(banner(page), "box-shadow")).not.toBe("none");
    expect(await computed(banner(page), "background-color")).toBe(
      "rgb(255, 255, 255)",
    );
    const finish = banner(page).getByRole("button", { name: "Finish" });
    expect(await computed(finish, "background-color")).toBe(TEAL);
    expect(await computed(finish, "text-transform")).toBe("none");
    await expectTouchTargets(banner(page).getByRole("button"));
  });

  test("a long section name never scrolls the page sideways @small", async ({
    page,
  }) => {
    await standing(page, "Upper Test with a rather long section name");
    await expect(banner(page)).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("narrow screens", () => {
  test("list, log and form never scroll sideways @small", async ({ page }) => {
    await openLogs(page);
    await expectNoHorizontalOverflow(page);
    await page.goto("/logs/9201");
    await expect(page.getByTestId("fact-label").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await startSectionLog(page);
    await expectNoHorizontalOverflow(page);
    await next(page).click();
    await next(page).click();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("design gaps", () => {
  const nativeDate = (page: Page) => page.locator('input[type="date"]');

  test("dates and times read in the app's format, not the browser's", async ({
    page,
  }) => {
    await startNewLog(page);
    await nativeDate(page).fill("2026-10-07");
    const shown = page.locator("input[readonly]").first();
    await expect(shown).toHaveValue(/^[A-Z][a-z]{2},? 07 Oct 2026$/);
    await page.locator('input[type="time"]').first().fill("07:05");
    await expect(page.locator("input[readonly]").nth(1)).toHaveValue("07:05");
    // The native input is the control and covers the field.
    const field = await shown.boundingBox();
    const native = await nativeDate(page).boundingBox();
    expect(field && native && native.width >= field.width - 1).toBe(true);
  });

  test("step 1 has no block headings, a private step 3 has two", async ({
    page,
  }) => {
    await startSectionLog(page);
    await expect(page.getByTestId("form-section-label")).toHaveCount(0);
    await next(page).click();
    await next(page).click();
    await expect(page.getByTestId("form-section-label")).toHaveText([
      "Details",
      "Visibility",
    ]);
    await expect(page.getByLabel("Title")).toHaveAttribute(
      "placeholder",
      "Leave blank to use the section name",
    );
  });

  test("the publish chips reach 44px", async ({ page }) => {
    await startSectionLog(page);
    await next(page).click();
    await next(page).click();
    await page.getByRole("radio", { name: "Public" }).click();
    await expectTouchTargets(page.locator(".MuiChip-root"));
  });

  test("sections: map, the picked list, then the search", async ({ page }) => {
    await page.goto(
      `/logs/new?waterwayId=${FIX.waterway}&sectionId=${FIX.sections.upper}`,
    );
    await next(page).click();
    // The form's map; on desktop the host map draws behind it as well.
    const map = await page
      .locator("canvas.maplibregl-canvas")
      .last()
      .boundingBox();
    const row = await page
      .getByRole("button", { name: "Log actions" })
      .boundingBox();
    const search = await page.getByLabel("Search river").boundingBox();
    expect(map && row && search).toBeTruthy();
    expect(map && row && map.y < row.y).toBe(true);
    expect(row && search && row.y < search.y).toBe(true);
    // No tiles or headings of their own: the pins sit under the list.
    await expect(page.getByText("Put in and take out")).toHaveCount(0);
    await expect(page.getByText("Search a waterway to see")).toHaveCount(0);
  });

  test("a new log runs for an hour; an end before the start blocks Next", async ({
    page,
  }) => {
    await startNewLog(page);
    const start = page.locator('input[type=time][aria-label="Start time"]');
    const end = page.locator('input[type=time][aria-label="End time"]');
    expect(await end.inputValue()).not.toBe(await start.inputValue());
    await expect(next(page)).toBeEnabled();
    await end.fill(await start.inputValue());
    await expect(page.getByRole("status")).toHaveText(
      "The run needs to end after it started.",
    );
    await expect(next(page)).toBeDisabled();
  });

  test("step 2 waits for a section and says so, calmly", async ({ page }) => {
    await startNewLog(page);
    await next(page).click();
    await expect(next(page)).toBeDisabled();
    await expect(page.getByRole("status")).toHaveText(
      "Add the section you paddled to go on.",
    );
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("Cancel asks before it throws a filled form away", async ({ page }) => {
    await startSectionLog(page);
    await page.getByRole("button", { name: "Multi day" }).click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Discard this log?")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).last().click();
    await expect(page).toHaveURL(/\/logs\/new/);
    await page.getByRole("button", { name: "Cancel" }).first().click();
    await page.getByRole("button", { name: "Discard" }).click();
    await expect(page).not.toHaveURL(/\/logs\/new/);
  });

  test("an untouched form leaves without asking", async ({ page }) => {
    await startNewLog(page);
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page).not.toHaveURL(/\/logs\/new/);
  });

  test("sharing picks people by name, and Publish after is not for private logs", async ({
    page,
  }) => {
    // The list as the client's types describe it, whatever the API build.
    await page.route("**/api/v1/users", (route) =>
      route.fulfill({
        json: [
          { id: "u-mara", username: "mara", incoming_pending: false },
          { id: "u-tobi", username: "tobi", incoming_pending: false },
        ],
      }),
    );
    await startSectionLog(page);
    await next(page).click();
    await next(page).click();
    await expect(page.getByText("Publish after")).toHaveCount(0);
    await page.getByRole("radio", { name: "Shared" }).click();
    await expect(page.getByLabel("Add user by ID")).toHaveCount(0);
    await expect(page.getByText("Publish after")).toBeVisible();
    const people = page.getByLabel("People");
    await people.fill("m");
    await expect(page.getByRole("option")).toHaveCount(0);
    await people.fill("ma");
    await page.getByRole("option", { name: /mara/i }).click();
    await expect(page.getByRole("button", { name: /mara/i })).toBeVisible();
  });

  test("sections: no put-in or take-out tiles before there is a route", async ({
    page,
  }) => {
    await startNewLog(page);
    await next(page).click();
    await expect(page.getByLabel("Search river")).toBeVisible();
    await expect(page.getByLabel("Label (optional)")).toHaveCount(0);
  });

  test("desktop: the bar docks at the pane foot and the segment is full width", async ({
    page,
  }, info) => {
    test.skip(!isDesktop(info), "desktop layout");
    await startNewLog(page);
    const pane = await page.getByText("Step 1 of 3 · When").boundingBox();
    const seg = await page
      .getByRole("button", { name: "Single day" })
      .boundingBox();
    const date = await page.locator('input[type="date"]').boundingBox();
    const vh = page.viewportSize()?.height ?? 0;
    expect(pane && pane.y > vh - 130).toBe(true);
    expect(seg && date && seg.x < date.x + 4).toBe(true);
    const group = await page
      .locator(".MuiToggleButtonGroup-root")
      .boundingBox();
    expect(group && date && Math.abs(group.width - date.width) <= 2).toBe(true);
  });

  test("a card names visibility in one word, no icon", async ({ page }) => {
    await openLogs(page);
    const c = card(page, "Private upper run");
    await expect(c).toContainText("Private");
    await expect(c.locator("svg")).toHaveCount(0);
  });

  test("phone: a month label's text sits on the 28 line", async ({
    page,
  }, info) => {
    test.skip(isDesktop(info), "phone grid");
    await openLogs(page);
    const x = await page
      .getByTestId("log-month")
      .first()
      .evaluate((el) => {
        const pad = Number.parseFloat(getComputedStyle(el).paddingLeft);
        return el.getBoundingClientRect().left + pad;
      });
    expect(x).toBe(28);
  });

  test("a month label has its space above, not below", async ({
    page,
  }, info) => {
    test.skip(isDesktop(info), "the card grid gives desktop a space below");
    await openLogs(page);
    const m = page.getByTestId("log-month").first();
    expect(await computed(m, "padding-top")).toBe("6px");
    expect(await computed(m, "padding-bottom")).toBe("0px");
  });

  test("social leaves no empty band above the tabs", async ({ page }) => {
    await openLogs(page);
    const mine = await page.getByText("My logs", { exact: true }).boundingBox();
    await page.getByText("Social", { exact: true }).first().click();
    await expect(page.getByText(/^Following \(/)).toBeVisible();
    const social = await page
      .getByText("My logs", { exact: true })
      .boundingBox();
    expect(mine && social && social.y < mine.y).toBe(true);
  });

  test("social rows have an avatar and one menu, never bare icons", async ({
    page,
  }) => {
    await openLogs(page);
    await page.getByText("Social", { exact: true }).first().click();
    const rows = page.getByTestId("person-row");
    await expect(rows.first()).toBeVisible();
    for (const row of await rows.all()) {
      expect(await row.getByRole("button").count()).toBeLessThanOrEqual(1);
      const av = await row.getByTestId("member-avatar").boundingBox();
      expect(av?.width).toBe(30);
      const box = await row.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(56);
    }
    const head = page.getByText(/^Following \(/);
    expect(await computed(head, "font-size")).toBe("13px");
    expect(await computed(head, "font-weight")).toBe("600");
    const pending = rows.filter({ hasText: "aoife" }).getByRole("button");
    await pending.click();
    await expect(page.getByRole("menuitem", { name: "Accept" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Decline" })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("desktop: the log header has no rule and shares the body's inset", async ({
    page,
  }, info) => {
    test.skip(!isDesktop(info), "desktop layout");
    await page.goto("/logs/9201");
    const title = page.getByRole("heading", { level: 3 });
    await expect(title).toBeVisible();
    const t = await title.boundingBox();
    const f = await page.getByTestId("fact-label").first().boundingBox();
    expect(t && f && Math.abs(t.x - f.x) <= 1).toBe(true);
    const sub = page.getByText(/vincent · .* · (Public|Private)/);
    expect(await computed(sub, "font-size")).toBe("13px");
  });

  test("phone: log sections are rows a thumb can hit", async ({
    page,
  }, info) => {
    test.skip(isDesktop(info), "the canvas card lists only noted sections");
    await page.goto("/logs/9201");
    const row = page.getByTestId("log-section").first();
    await expect(row).toBeVisible();
    const box = await row.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });

  test("a wrapped level pill keeps the age on the date line @small", async ({
    page,
  }) => {
    await openLogs(page);
    const c = card(page, "Public multi-section run");
    const ago = await c.getByText(/ago$/).boundingBox();
    const date = await c
      .getByText(/\d{2} \w{3} 2026/)
      .first()
      .boundingBox();
    expect(ago && date && ago.y + ago.height >= date.y + date.height - 1).toBe(
      true,
    );
    expect(ago && date && ago.y >= date.y - 2).toBe(true);
  });
});

test.describe("log load failures", () => {
  const body = {
    error: { code: "internal", message: "Boom from server", target: null },
  };

  test("a failed list shows the server message, not the empty state", async ({
    page,
  }) => {
    await page.route("**/api/v1/descents?*", (r) =>
      r.fulfill({ status: 500, json: body }),
    );
    await page.goto("/logs");
    await expect(page.getByTestId("error-state")).toContainText(
      "Boom from server",
    );
    await expect(page.getByText("No descents logged yet.")).toHaveCount(0);
  });

  test("a failed log does not say not found", async ({ page }) => {
    await page.route("**/api/v1/descents/9201", (r) =>
      r.fulfill({ status: 500, json: body }),
    );
    await page.goto("/logs/9201");
    await expect(page.getByTestId("error-state")).toContainText(
      "Boom from server",
    );
    await expect(page.getByText("Log not found.")).toHaveCount(0);
  });

  test("the desktop card states duration, sections, level and the run", async ({
    page,
  }, info) => {
    test.skip(!isDesktop(info), "the desktop card");
    await page.goto("/logs/9201");
    const facts = page.getByTestId("log-facts");
    await expect(facts).toContainText("Duration");
    await expect(facts).toContainText("Sections");
    await expect(facts).toContainText("Level");
    await expect(page.getByTestId("log-stop")).toHaveCount(2);
  });
});
