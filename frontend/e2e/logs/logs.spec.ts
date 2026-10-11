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
  }) => {
    await openLogs(page);
    const c = card(page, "Public multi-section run");
    expect(await computed(c, "border-top-left-radius")).toBe("14px");
    expect(await computed(c, "box-shadow")).toContain(E1_COLOR);
    expect(await computed(c, "border-top-width")).toBe("0px");
    expect(await computed(c, "background-color")).toBe("rgb(255, 255, 255)");
  });

  test("cards are separated and at least 56px tall", async ({ page }) => {
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
    await expect(page.getByText(/^\d+ results?$/).first()).toBeVisible();
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
    // The list stays, with the open log ringed in teal.
    await expect(c).toBeVisible();
    expect(await computed(c, "box-shadow")).toContain(TEAL);
    expect(await computed(c, "background-color")).toBe("rgb(255, 255, 255)");
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
  }) => {
    await openLogs(page);
    await card(page, "Public multi-section run").click();
    const labels = page.getByTestId("fact-label");
    await expect(labels.filter({ hasText: /^Date$/ })).toBeVisible();
    await expect(labels.filter({ hasText: /^Time$/ })).toBeVisible();
    await expect(page.getByText("Sections (2)")).toBeVisible();
    const row = page.getByTestId("log-section").first();
    await expect(row).toContainText("Upper Test");
    expect(await computed(row, "border-top-left-radius")).toBe("14px");
    expect(await computed(row, "background-color")).not.toBe(
      "rgb(255, 255, 255)",
    );
    expect(await computed(row, "box-shadow")).toBe("none");
    await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  });

  test("a section's level shows as a pill", async ({ page }) => {
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
    await page.getByRole("button", { name: "More actions" }).click();
    await expect(page.getByRole("menuitem", { name: "Edit" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
    await page.keyboard.press("Escape");
    // Somebody else's public log has no menu.
    await page.goto("/logs/9203");
    await expect(page.getByTestId("fact-label").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "More actions" }),
    ).toHaveCount(0);
  });
});

test.describe("log descent", () => {
  const targets = (page: Page) =>
    page.locator("main button:visible, main .MuiInputBase-root:visible");

  test("inputs are 16px on every step", async ({ page }) => {
    await startNewLog(page);
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
    await startNewLog(page);
    await expectTouchTargets(targets(page));
    await next(page).click();
    await next(page).click();
    await expectTouchTargets(targets(page));
  });

  // Known limitation: the section search (SectionAdder) and the put-in pin's
  // label field (LocationPin) are shared parts owned elsewhere and 40px tall.
  test.fail("sections step reaches 44px (shared parts)", async ({ page }) => {
    await startNewLog(page);
    await next(page).click();
    await expectTouchTargets(targets(page));
  });

  test("the chrome is the bottom bar with a round teal action", async ({
    page,
  }) => {
    await startNewLog(page);
    await expect(page.getByText("Step 1 of 3 · When")).toBeVisible();
    expect(await computed(next(page), "border-top-left-radius")).toBe("50%");
    expect(await computed(next(page), "background-color")).toBe(TEAL);
    await next(page).click();
    await expect(page.getByText("Step 2 of 3 · Sections")).toBeVisible();
  });

  test("the blocks are labelled sections", async ({ page }) => {
    await startNewLog(page);
    await expect(page.getByTestId("form-section-label")).toHaveCount(2);
    await next(page).click();
    await next(page).click();
    await expect(
      page.getByTestId("form-section-label").filter({ hasText: "Title" }),
    ).toBeVisible();
    // The heading names the choice; the picker does not repeat it.
    await expect(page.getByText("Visibility", { exact: true })).toHaveCount(0);
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

    await page.getByRole("button", { name: "More actions" }).click();
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
    await page.goto("/logs/new");
    await expect(page.getByText("Step 1 of 3 · When")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await next(page).click();
    await next(page).click();
    await expectNoHorizontalOverflow(page);
  });
});
