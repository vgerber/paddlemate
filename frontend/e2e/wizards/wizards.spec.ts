import { expect, type Page, type Route, test } from "@playwright/test";
import {
  appReady,
  computed,
  expectNoHorizontalOverflow,
  expectTouchTargets,
  FIX,
  gotoSection,
} from "../support/fixture";

// WP10: the three suggest wizards in the calm design
// (doc/plans/ui-overhaul/calm-design.html, "Suggest section", "New river",
// "Suggest new feature"). Nothing is written: each submit is intercepted,
// its body asserted and fulfilled with a canned reply.

const TEAL = "rgb(14, 116, 144)";

test.use({ hasTouch: true });

const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 768;
/** The panel of the current layout; the other one stays mounted but hidden. */
const pane = (page: Page) =>
  page.getByTestId(isDesktop(page) ? "side-panel" : "mobile-overlay");
const verb = (page: Page) => (isDesktop(page) ? "Click" : "Tap");

/** Fulfil a write with a canned reply and hand back the request body. */
async function captureWrite(page: Page, url: string) {
  const bodies: unknown[] = [];
  await page.route(url, async (route: Route) => {
    if (route.request().method() !== "POST") return route.fallback();
    bodies.push(route.request().postDataJSON());
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ id: 99999, name: "canned" }),
    });
  });
  return bodies;
}

async function blockOverpass(page: Page) {
  await page.route(/overpass/, (route) => route.abort());
}

/** Every text input and textarea of the visible form is 16px. */
async function expectInputs16(page: Page) {
  const sizes = await page
    .locator("input:visible:not([type=hidden]), textarea:visible")
    .evaluateAll((els) =>
      els
        .filter(
          (el) => (el as HTMLElement).getAttribute("aria-hidden") !== "true",
        )
        .map((el) => getComputedStyle(el).fontSize),
    );
  expect(sizes.length).toBeGreaterThan(0);
  expect(sizes.filter((s) => s !== "16px")).toEqual([]);
}

/** No form text is upper case, and no heading is in capitals. */
async function expectSentenceCase(page: Page) {
  const caps = await page
    .locator("[data-testid=form-section-label]")
    .evaluateAll((els) =>
      els
        .map((el) => ({
          text: el.textContent ?? "",
          tt: getComputedStyle(el).textTransform,
        }))
        .filter((e) => e.tt === "uppercase" || e.text === e.text.toUpperCase()),
    );
  expect(caps).toEqual([]);
}

async function openSectionWizard(page: Page) {
  await blockOverpass(page);
  await page.goto(`/waterways/suggest-section?waterway=${FIX.waterway}`);
  await expect(page.getByLabel("Name").first()).toBeVisible();
}

/** Click the map at a fraction of its box, once a smooth scroll has settled. */
async function clickMap(page: Page, fx: number, fy: number) {
  const canvas = page.locator("canvas.maplibregl-canvas").first();
  await canvas.scrollIntoViewIfNeeded();
  let last = "";
  await expect
    .poll(async () => {
      const now = JSON.stringify(await canvas.boundingBox());
      const settled = now === last;
      last = now;
      return settled;
    })
    .toBe(true);
  const box = await canvas.boundingBox();
  if (!box) throw new Error("map has no box");
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

async function pickOnMap(page: Page, pin: "Put-in" | "Take-out", at: number) {
  await page.locator("button[aria-pressed]").filter({ hasText: pin }).click();
  await clickMap(page, at, 0.5);
}

test.describe("suggest section", () => {
  test("naming step is a calm form with a quiet step line", async ({
    page,
  }) => {
    await openSectionWizard(page);
    await expect(page.getByTestId("form-section-label").first()).toHaveText(
      "Name this section",
    );
    await expect(page.getByText("Step 1 of 3 · Naming")).toBeVisible();
    await expectInputs16(page);
    await expectSentenceCase(page);
    await expectTouchTargets(
      page.getByRole("button", { name: /^(Cancel|Next)$/ }),
    );
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  test("walks the steps and sends the right body @small", async ({ page }) => {
    const bodies = await captureWrite(
      page,
      `**/waterways/${FIX.waterway}/sections`,
    );
    await openSectionWizard(page);
    await expectNoHorizontalOverflow(page);
    await page.getByLabel("Name").first().fill("Wizard Spec Section");
    await page.getByRole("button", { name: "Next" }).click();

    // Section step: plain-language hint, device-specific verb.
    await expect(page.getByText("Step 2 of 3 · Section")).toBeVisible();
    const hint = page.getByTestId("pick-hint");
    await expect(hint).toHaveText(`${verb(page)} the map to set the put-in`);
    await expectNoHorizontalOverflow(page);
    await pickOnMap(page, "Put-in", 0.35);
    await expect(hint).toHaveText(`${verb(page)} the map to set the take-out`);
    await pickOnMap(page, "Take-out", 0.65);
    await expect(page.getByTestId("picked-put-in")).toBeVisible();
    await expect(page.getByTestId("picked-take-out")).toBeVisible();
    await expectTouchTargets(page.getByRole("button", { name: /^Clear / }));

    // A cleared point puts its hint back.
    await page.getByRole("button", { name: "Clear put-in" }).click();
    await expect(hint).toHaveText(`${verb(page)} the map to set the put-in`);
    await pickOnMap(page, "Put-in", 0.35);

    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText("Step 3 of 3 · Features")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // Feature type grid: tiles, the chosen one teal.
    const grid = page.getByRole("radiogroup", { name: "Feature type" });
    const tiles = grid.getByRole("radio");
    expect(await tiles.count()).toBe(14);
    await expectTouchTargets(tiles);
    await grid.getByRole("radio", { name: "Weir" }).click();
    const chosen = grid.getByRole("radio", { name: "Weir" });
    await expect(chosen).toHaveAttribute("aria-checked", "true");
    expect(await computed(chosen, "color")).toBe(TEAL);
    await expect(grid.getByRole("radio", { name: "Rapid" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expectInputs16(page);
    await expectSentenceCase(page);

    await page.getByLabel("Name", { exact: true }).last().fill("Spec weir");
    await page.getByRole("button", { name: "Place on map" }).click();
    await clickMap(page, 0.5, 0.5);
    await page.getByRole("button", { name: "Add feature" }).click();
    await expect(page.getByText("1 feature added")).toBeVisible();

    await page.getByRole("button", { name: "Suggest section" }).click();
    await expect.poll(() => bodies.length).toBe(1);
    const body = bodies[0] as {
      name: string;
      features: { feature_type: string; name: string | null }[];
      location: { coordinates: unknown[] };
    };
    expect(body.name).toBe("Wizard Spec Section");
    expect(body.features.map((f) => f.feature_type)).toEqual([
      "put_in",
      "take_out",
      "weir",
    ]);
    expect(body.features[2].name).toBe("Spec weir");
    expect(body.location.coordinates.length).toBeGreaterThanOrEqual(2);
    await expect(page.getByText("Section submitted").first()).toBeVisible();
  });
});

test.describe("suggest river", () => {
  async function openRiverForm(page: Page) {
    await page.goto("/?panel=1");
    await appReady(page);
    await page
      .getByRole("button", { name: "New river" })
      .filter({ visible: true })
      .first()
      .click();
    await expect(pane(page).getByLabel("Name").first()).toBeVisible();
  }

  test("a calm form that sends name and description @small", async ({
    page,
  }) => {
    const bodies = await captureWrite(page, "**/api/v1/waterways");
    await openRiverForm(page);
    await expect(
      pane(page).getByTestId("form-section-label").first(),
    ).toHaveText("River name");
    await expectInputs16(page);
    await expectSentenceCase(page);
    await expectTouchTargets(
      page.getByRole("button", { name: /^(Cancel|Submit)$/ }),
    );
    await expectNoHorizontalOverflow(page);
    await pane(page).getByLabel("Name").first().fill("Wizard Spec Creek");
    await pane(page).getByLabel("Description").fill("Spec only");
    await pane(page).getByRole("button", { name: "Submit" }).click();
    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0]).toEqual({
      name: "Wizard Spec Creek",
      description: "Spec only",
    });
    const card = pane(page).getByTestId("river-submitted");
    await expect(card).toBeVisible();
    await expect(card).toContainText("River submitted");
    expect(await computed(card, "border-top-left-radius")).toBe("14px");
    await expectNoHorizontalOverflow(page);
  });

  test("similar rivers are chips that fill the name", async ({ page }) => {
    await openRiverForm(page);
    await pane(page).getByLabel("Name").first().fill("Test");
    const chip = pane(page).getByTestId("similar-river").first();
    await expect(chip).toBeVisible();
    // The 44px hit area is the chip's ::after, 6px beyond each edge.
    const hit = await chip.evaluate((el) => {
      const after = getComputedStyle(el, "::after");
      return (
        el.getBoundingClientRect().height + Number.parseFloat(after.top) * -2
      );
    });
    expect(hit).toBeGreaterThanOrEqual(44);
    const text = (await chip.textContent()) ?? "";
    await chip.click();
    const value = await pane(page).getByLabel("Name").first().inputValue();
    expect(text.startsWith(value)).toBe(true);
  });
});

test.describe("suggest feature", () => {
  async function openFeatureForm(page: Page) {
    await gotoSection(page, "lower");
    const docked = page.getByRole("button", { name: "New feature" });
    if (await docked.filter({ visible: true }).count()) {
      await docked.filter({ visible: true }).first().click();
    } else {
      await page.getByRole("button", { name: "Section actions" }).click();
      await page.getByRole("menuitem", { name: "Add feature" }).click();
    }
    await expect(
      pane(page).getByRole("radiogroup", { name: "Feature type" }),
    ).toBeVisible();
  }

  test("the icon grid picks the type and the body follows @small", async ({
    page,
  }) => {
    const bodies = await captureWrite(
      page,
      `**/sections/${FIX.sections.lower}/features`,
    );
    await openFeatureForm(page);
    const grid = pane(page).getByRole("radiogroup", { name: "Feature type" });
    const tiles = grid.getByRole("radio");
    expect(await tiles.count()).toBe(14);
    await expectTouchTargets(tiles);
    for (const tile of await tiles.all()) {
      await expect(tile.locator("svg path").first()).toBeAttached();
    }
    await grid.getByRole("radio", { name: "Siphon" }).click();
    expect(
      await computed(grid.getByRole("radio", { name: "Siphon" }), "color"),
    ).toBe(TEAL);
    await expectInputs16(page);
    await expectSentenceCase(page);
    await expectNoHorizontalOverflow(page);
    await expect(pane(page).getByText("Suggest new feature")).toBeVisible();

    await pane(page)
      .getByLabel("Name", { exact: true })
      .last()
      .fill("Spec siphon");
    await pane(page).getByRole("button", { name: "Place on map" }).click();
    await expect(
      pane(page).getByText(`${verb(page)} the map to place`),
    ).toBeVisible();
    await clickMap(page, 0.5, 0.3);
    await expect(pane(page).getByTestId("placed-point")).toBeVisible();
    await pane(page).getByRole("button", { name: "Submit" }).click();
    await expect.poll(() => bodies.length).toBe(1);
    const body = bodies[0] as {
      feature_type: string;
      name: string;
      location: { type: string };
    };
    expect(body.feature_type).toBe("siphon");
    expect(body.name).toBe("Spec siphon");
    expect(body.location.type).toBe("Point");
  });
});
