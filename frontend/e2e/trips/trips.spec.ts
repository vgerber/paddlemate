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
    await expect(page.getByText(/\d+ results?/)).toBeVisible();
    const first = page.getByTestId("trip-card").first();
    const name = (await first.innerText()).split("\n")[0];
    await first.click();
    await expect(page).toHaveURL(/selected=/);
    // The pane keeps the trip's title and drops only the back arrow.
    await expect(page.getByText(name, { exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);
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
    await dialog.getByTestId("user-pick").first().click();
    await expect(dialog.getByRole("alert")).toContainText("Nope.");
    await expect(dialog).toBeVisible();
  });
});

test.describe("trip gaps", () => {
  test("the week is a pill band with a disc, the handle 16px with a 44px hit", async ({
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
    expect(handle.height).toBe(16);
    // 14px below the handle is still the handle.
    const hit = await page.evaluate(
      ([x, y]) =>
        document.elementFromPoint(x, y)?.getAttribute("aria-label") ?? "",
      [handle.x + handle.width / 2, handle.y + handle.height + 14],
    );
    expect(hit).toBe("Show the month");
  });

  test("today keeps its ring when it is also the current day", async ({
    page,
  }) => {
    await openPlan(page);
    const today = strip(page).locator("[data-today=true]");
    await today.click();
    await expect(today).toHaveAttribute("data-current", "true");
    const disc = strip(page).getByTestId("current-disc").locator("> div");
    await expect(disc).toHaveCSS("box-shadow", /0px 0px 0px 4px/);
  });

  test("days outside the trip sit back", async ({ page }) => {
    await openPlan(page);
    const first = strip(page).getByTestId("week-day").first();
    await expect(first.getByTestId("day-number")).toHaveCSS("opacity", "0.55");
  });

  test("the open month dims the list and a tap on it closes the month", async ({
    page,
  }) => {
    await openPlan(page);
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
    await page.getByRole("button", { name: "Add a day" }).click();
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
    const a = await page.getByLabel("Starts").boundingBox();
    const b = await page.getByLabel("Ends (optional)").boundingBox();
    expect(a?.y).toBe(b?.y);
    await expectNoHorizontalOverflow(page);
  });

  test("desktop: trip panel, docked action, deep links land in the split", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "desktop");
    await page.goto(`/trips/${TRIP}`);
    await expect(page).toHaveURL(new RegExp(`/trips\\?selected=${TRIP}`));
    await expect(dayCards(page).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Add a day" })).toBeVisible();
    await expect(page.locator(".MuiFab-root:visible")).toHaveCount(0);
    const panel = page.getByTestId("trip-panel");
    await expect(panel).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(panel).toHaveCSS("border-radius", "14px");
    await page.goto("/trips/new");
    await expect(page).toHaveURL(/\/trips\?new=true/);
    await expect(page.getByTestId("trip-card").first()).toBeVisible();
    await expect(page.getByLabel("Trip name")).toBeVisible();
  });
});
