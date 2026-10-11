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
    await openList(page);
    await expect(page.getByText(/\d+ trips?/)).toBeVisible();
    await page.getByTestId("trip-card").first().click();
    await expect(page).toHaveURL(/selected=/);
    await expect(
      page.getByRole("tab", { name: "Plan", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("trip-card").first()).toBeVisible();
  });

  test("no sideways scroll @small", async ({ page }) => {
    await openList(page);
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("trip plan", () => {
  test("week strip: seven days, 44px, today marked", async ({ page }) => {
    await openPlan(page);
    const days = strip(page).getByTestId("week-day");
    await expect(days).toHaveCount(7);
    await expectTouchTargets(days);
    await expect(strip(page).locator("[data-today=true]")).toHaveCount(1);
    await expect(
      strip(page).locator("[data-has-entries=true]").first(),
    ).toBeVisible();
  });

  test("strip stays pinned while the days scroll", async ({ page }) => {
    await openPlan(page);
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
    await openPlan(page);
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
    await openPlan(page);
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
    await openPlan(page);
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
      expect(style.shadow).not.toBe("none");
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
    await expect(page.getByText(/^\d+ logs?$/).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("trip forms", () => {
  async function expectFormFields(page: Page) {
    const sizes = await page
      .locator(
        "input:visible:not([aria-hidden]), textarea:visible, [role=combobox]:visible",
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
    expect(sizes.length).toBeGreaterThan(2);
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

  test("an end before the start blocks saving", async ({ page }) => {
    await page.goto(`/trips/${TRIP}?edit=true`);
    await page.getByLabel("Ends (optional)").fill("2000-01-01");
    await expect(
      page.getByRole("button", { name: "Save trip" }),
    ).toBeDisabled();
  });
});

test.describe("add member dialog", () => {
  test("one field, a contained action, stays open on failure", async ({
    page,
  }) => {
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
    const add = dialog.getByRole("button", { name: "Add to trip" });
    await expect(add).toBeDisabled();
    await dialog.getByTestId("user-pick").first().click();
    await expect(add).toBeEnabled();
    const bg = await add.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe("rgba(0, 0, 0, 0)");
    await expectTouchTargets(add);
    await add.click();
    await expect(dialog.getByRole("alert")).toContainText("Nope.");
    await expect(dialog).toBeVisible();
  });
});
