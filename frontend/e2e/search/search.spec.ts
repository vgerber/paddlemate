import { expect, type Locator, type Page, test } from "@playwright/test";
import { Finger } from "../support/finger";
import {
  appReady,
  computed,
  expectNoHorizontalOverflow,
  expectTouchTargets,
} from "../support/fixture";

// The search panel of the calm design: a header with Name, Area and Region
// tabs, one field, chips for the filters, one Filters sheet, and the results.
// "Test" matches the fixture river and a few more.

const TEAL = "rgb(14, 116, 144)";

async function openSearch(page: Page, query = "") {
  await page.goto(`/?panel=1${query}`);
  await appReady(page);
  await expect(
    page.getByRole("tab", { name: "Name", exact: true }),
  ).toBeVisible();
}

/** The sidebar and the phone overlay both mount the panel; one is hidden. */
const seen = (l: Locator) => l.filter({ visible: true });

const modeTab = (page: Page, name: string) =>
  seen(page.getByRole("tab", { name, exact: true }));
const nameField = (page: Page) =>
  seen(page.getByRole("textbox", { name: "Name", exact: true }));
const regionField = (page: Page) =>
  seen(page.getByRole("textbox", { name: "Search regions" }));
const chip = (page: Page, name: RegExp | string) =>
  seen(page.locator(".MuiChip-root", { hasText: name }));
const sheet = (page: Page) =>
  seen(page.getByRole("dialog", { name: "Filters" }));

/** The number inside "Label (n)" on a result tab. */
async function tabCount(page: Page, label: string) {
  const text = await seen(
    // Not by role: a dialog hides the page behind it from the tree.
    page.locator("button.MuiTab-root", {
      hasText: new RegExp(`^${label}( \\(|$)`),
    }),
  ).textContent();
  // A zero count is dropped from the label.
  return Number(/\((\d+)\)/.exec(text ?? "")?.[1] ?? 0);
}

/** The level classes of the section rows on show, sorted and without repeats. */
async function rowLevels(page: Page) {
  const levels = await seen(page.getByTestId("search-pane"))
    .locator("[data-level]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-level") ?? ""));
  return [...new Set(levels)].sort();
}

test.describe("header and tabs", () => {
  test("@small the title is panel-title size and a phone has the map icon", async ({
    page,
  }, info) => {
    await openSearch(page);
    const title = seen(page.getByRole("heading", { name: "Search" }));
    if (info.project.name === "desktop") {
      // The desktop card draws the title in its own header.
      await expect(title).toHaveCount(0);
      await expect(
        seen(page.getByRole("button", { name: "Map", exact: true })),
      ).toHaveCount(0);
      return;
    }
    await expect(title).toBeVisible();
    expect(await computed(title, "font-size")).toBe("20px");
    expect(await computed(title, "font-weight")).toBe("700");
    const map = seen(page.getByRole("button", { name: "Map", exact: true }));
    await expect(map).toBeVisible();
    await expect(map.locator('[data-testid="MapOutlinedIcon"]')).toBeVisible();
    await expectTouchTargets(map, 44);
    await map.click();
    await expect(page).not.toHaveURL(/panel=/);
  });

  test("@small the header names the screen and the tabs are underlined", async ({
    page,
  }, info) => {
    test.skip(info.project.name === "desktop", "the phone's title row");
    await openSearch(page);
    await expect(seen(page.getByText("Search", { exact: true }))).toBeVisible();
    const tabs = seen(
      page.locator("button.MuiTab-root", { hasText: /^(Name|Area|Region)$/ }),
    );
    await expect(tabs).toHaveCount(3);
    const heights = await tabs.evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect().height),
    );
    for (const h of heights) expect(Math.round(h)).toBeGreaterThanOrEqual(48);
    expect(await computed(modeTab(page, "Name"), "color")).toBe(TEAL);
    expect(await computed(modeTab(page, "Area"), "color")).not.toBe(TEAL);
    expect(await computed(modeTab(page, "Name"), "text-transform")).toBe(
      "none",
    );
    await expectNoHorizontalOverflow(page);
  });

  test("@small title, tabs, field and chips share one ground", async ({
    page,
  }, info) => {
    await openSearch(page, "&q=Test");
    const white = "rgb(255, 255, 255)";
    if (info.project.name === "desktop") {
      // One white surface from the tabs down to the rows: no grey band.
      const pane = seen(page.getByTestId("search-pane"));
      const root = pane.locator("xpath=..");
      expect(await computed(root, "background-color")).toBe(white);
      const row = seen(page.getByTestId("search-section-row")).first();
      expect(await computed(row, "background-color")).toBe("rgba(0, 0, 0, 0)");
    }
    await expectNoHorizontalOverflow(page);
  });

  test("the tab chosen is the mode in the URL", async ({ page }) => {
    await openSearch(page);
    await modeTab(page, "Area").click();
    await expect(page).toHaveURL(/mode=area/);
    await modeTab(page, "Region").click();
    await expect(page).toHaveURL(/mode=region/);
    await modeTab(page, "Name").click();
    await expect(page).not.toHaveURL(/mode=/);
  });

  test("typed text and filters stay when the mode changes", async ({
    page,
  }) => {
    await openSearch(page);
    await nameField(page).fill("Test");
    await modeTab(page, "Area").click();
    await modeTab(page, "Name").click();
    await expect(nameField(page)).toHaveValue("Test");
  });

  test("a swipe on the pane moves between modes", async ({ page }, info) => {
    test.skip(info.project.name === "desktop", "touch only");
    await openSearch(page);
    const field = await nameField(page).boundingBox();
    if (!field) throw new Error("no field");
    // Start below the field, on the pane, clear of the 24px edge.
    const finger = await Finger.down(page, 300, field.y + field.height + 140);
    await finger.moveBy(-220);
    await finger.up();
    await expect(page).toHaveURL(/mode=area/);
    await expect(modeTab(page, "Area")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});

test.describe("name mode", () => {
  test("@small the field is the filled one: 16px, label inside, 44px clear button", async ({
    page,
  }) => {
    await openSearch(page);
    const field = nameField(page);
    expect(await computed(field, "font-size")).toBe("16px");
    const box = await field
      .locator("xpath=ancestor::div[contains(@class,'MuiInputBase-root')]")
      .boundingBox();
    expect(box?.height).toBe(56);
    await expect(seen(page.getByRole("button", { name: "Clear" }))).toHaveCount(
      0,
    );
    await field.fill("Test");
    const clear = seen(page.getByRole("button", { name: "Clear" }));
    await expect(clear).toBeVisible();
    await expectTouchTargets(clear, 44);
    await clear.click();
    await expect(field).toHaveValue("");
  });

  test("before any input the recent rivers are offered", async ({ page }) => {
    await page.goto("/");
    await appReady(page);
    await page.evaluate(() =>
      localStorage.setItem(
        "pm.recent-waterways",
        JSON.stringify([{ id: 9001, name: "Test River" }]),
      ),
    );
    await openSearch(page);
    await expect(seen(page.getByText("Recent rivers"))).toBeVisible();
    const row = seen(page.getByTestId("recent-river")).first();
    expect(await computed(row.getByText("Test River"), "font-size")).toBe(
      "15px",
    );
    expect(await computed(row.getByText("Test River"), "font-weight")).toBe(
      "500",
    );
    await expect(row.getByText("river", { exact: true })).toBeVisible();
    await expect(
      seen(page.getByText("Recent rivers")).locator("svg"),
    ).toHaveCount(0);
  });

  test("without history the panel says how to start, in the empty-state tile", async ({
    page,
  }) => {
    await page.goto("/");
    await appReady(page);
    await page.evaluate(() => localStorage.removeItem("pm.recent-waterways"));
    await openSearch(page);
    const empty = seen(page.getByTestId("empty-state"));
    await expect(empty).toContainText(
      "Type a name, country or difficulty to search",
    );
    await expect(seen(page.getByTestId("state-tile"))).toBeVisible();
    await expect(seen(page.getByTestId("recent-river"))).toHaveCount(0);
  });

  test("the name field is a magnifier and a placeholder, not a pinned label", async ({
    page,
  }) => {
    await openSearch(page);
    const field = nameField(page);
    await expect(field).toHaveAttribute("placeholder", "Name");
    await expect(seen(page.getByTestId("SearchIcon")).first()).toBeVisible();
  });

  test("@small chips are 44px white pills and teal when set", async ({
    page,
  }) => {
    await openSearch(page, "&q=Test");
    const grade = chip(page, "Grade");
    const country = chip(page, "Country");
    await expect(grade).toBeVisible();
    await expect(country).toBeVisible();
    for (const c of [grade, country]) {
      const box = await c.boundingBox();
      expect(box?.height).toBe(44);
      expect(await computed(c, "background-color")).toBe("rgb(255, 255, 255)");
      const hit = await c.evaluate((el) => {
        const after = getComputedStyle(el, "::after");
        return (
          el.getBoundingClientRect().height - Number.parseFloat(after.top) * 2
        );
      });
      expect(hit).toBeGreaterThanOrEqual(44);
    }
    expect(await computed(grade, "color")).not.toBe(TEAL);
    await page.goto("/?panel=1&q=Test&min_diff=3&country=AT");
    await appReady(page);
    await expect(chip(page, /^Grade III/)).toBeVisible();
    await expect(chip(page, /^AT/)).toBeVisible();
    expect(await computed(chip(page, /^Grade III/), "color")).toBe(TEAL);
    expect(await computed(chip(page, /^AT/), "color")).toBe(TEAL);
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("filters sheet", () => {
  test("@small a chip opens the sheet with the three fields and a result button", async ({
    page,
  }) => {
    await openSearch(page, "&q=Test");
    await chip(page, "Grade").click();
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page).getByLabel("Min grade")).toBeVisible();
    await expect(sheet(page).getByLabel("Max grade")).toBeVisible();
    await expect(sheet(page).getByLabel("Country")).toBeVisible();
    await expect(
      sheet(page).getByRole("button", { name: "Reset" }),
    ).toBeVisible();
    const done = sheet(page).getByRole("button", { name: /^\d+ results?$/ });
    await expect(done).toBeVisible();
    expect((await done.boundingBox())?.height).toBe(52);
    for (const label of ["Min grade", "Max grade", "Country"]) {
      expect(await computed(sheet(page).getByLabel(label), "font-size")).toBe(
        "16px",
      );
    }
    await expectNoHorizontalOverflow(page);
  });

  test("@small the sheet title is 18px bold, fields are filled and Water now chips 44px", async ({
    page,
  }) => {
    await openSearch(page, "&q=Test");
    await chip(page, /^Water/).click();
    const title = sheet(page).getByRole("heading", { name: "Filters" });
    expect(await computed(title, "font-size")).toBe("18px");
    expect(await computed(title, "font-weight")).toBe("700");
    for (const label of ["Min grade", "Max grade", "Country"]) {
      const field = sheet(page)
        .getByLabel(label)
        .locator("xpath=ancestor::div[contains(@class,'MuiFilledInput-root')]");
      const box = await field.boundingBox();
      expect(box?.height, label).toBeGreaterThanOrEqual(52);
      expect(box?.height, label).toBeLessThanOrEqual(56);
      expect(await computed(field, "border-top-left-radius")).toBe("12px");
      // The label sits inside the field, above the value.
      const lab = await sheet(page)
        .locator("label", { hasText: label })
        .boundingBox();
      expect(lab?.y).toBeGreaterThan(box?.y ?? 0);
      expect((lab?.y ?? 0) + (lab?.height ?? 0)).toBeLessThan(
        (box?.y ?? 0) + (box?.height ?? 0) / 2 + 4,
      );
    }
    for (const name of ["Low", "Medium", "High"]) {
      const b = await sheet(page)
        .getByRole("button", { name, exact: true })
        .boundingBox();
      expect(b?.height, name).toBeGreaterThanOrEqual(44);
    }
  });

  test("Escape closes the sheet and focus returns to the chip", async ({
    page,
  }) => {
    await openSearch(page, "&q=Test");
    await chip(page, "Grade").focus();
    await page.keyboard.press("Enter");
    await expect(sheet(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toHaveCount(0);
    await expect(chip(page, "Grade")).toBeFocused();
  });

  test("setting Min grade narrows the results and shows on the chip", async ({
    page,
  }) => {
    await openSearch(page, "&q=Test");
    await expect(
      seen(page.getByRole("tab", { name: /^Rivers \(/ })),
    ).toBeVisible();
    await expect.poll(() => tabCount(page, "Rivers")).toBeGreaterThan(0);
    const before = await tabCount(page, "Rivers");
    await chip(page, "Grade").click();
    await sheet(page).getByLabel("Min grade").selectOption({ label: "VI" });
    await expect(page).toHaveURL(/min_diff=6/);
    await sheet(page)
      .getByRole("button", { name: /^\d+ results?$/ })
      .click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(chip(page, /^Grade VI/)).toBeVisible();
    await expect.poll(() => tabCount(page, "Rivers")).toBeLessThan(before);
  });

  test("Water now: three chips, several on, narrowing the sections", async ({
    page,
  }) => {
    await openSearch(page, "&q=Test");
    await expect.poll(() => tabCount(page, "Sections")).toBeGreaterThan(1);
    await expect(chip(page, /^Water/)).toBeVisible();
    expect(await computed(chip(page, /^Water/), "color")).not.toBe(TEAL);
    await chip(page, /^Water/).click();
    const levels = ["Low", "Medium", "High"];
    for (const name of levels) {
      await expect(
        seen(sheet(page).getByRole("button", { name, exact: true })),
      ).toHaveAttribute("aria-pressed", "false");
    }
    const level = (name: string) =>
      sheet(page).getByRole("button", { name, exact: true });
    await level("High").click();
    await expect.poll(() => rowLevels(page)).toEqual(["high"]);
    await level("Low").click();
    await expect.poll(() => rowLevels(page)).toEqual(["high", "low"]);
    await expect(level("High")).toHaveAttribute("aria-pressed", "true");
    await expect(level("Low")).toHaveAttribute("aria-pressed", "true");
    await expect(level("Medium")).toHaveAttribute("aria-pressed", "false");
    const done = sheet(page).getByRole("button", { name: /^\d+ results?$/ });
    await expect
      .poll(async () => {
        const n = await tabCount(page, "Sections");
        return (
          (await done.textContent()) === `${n} result${n === 1 ? "" : "s"}`
        );
      })
      .toBe(true);
    await done.click();
    expect(await computed(chip(page, /^Water/), "color")).toBe(TEAL);
  });

  test("Water now is in the URL, survives a reload and both panels agree", async ({
    page,
  }) => {
    await openSearch(page, "&q=Test");
    await expect.poll(() => tabCount(page, "Sections")).toBeGreaterThan(1);
    const all = await tabCount(page, "Sections");
    await chip(page, /^Water/).click();
    await sheet(page)
      .getByRole("button", { name: "High", exact: true })
      .click();
    await expect(page).toHaveURL(/water=/);
    await page.keyboard.press("Escape");
    await expect.poll(() => rowLevels(page)).toEqual(["high"]);
    await page.reload();
    await appReady(page);
    expect(await computed(chip(page, /^Water/), "color")).toBe(TEAL);
    await expect.poll(() => rowLevels(page)).toEqual(["high"]);
    const narrowed = await tabCount(page, "Sections");
    expect(narrowed).toBeLessThan(all);
    // The sidebar and the phone overlay are both mounted; every copy of the
    // tab, hidden or not, shows the same count.
    const labels = await page
      .locator("button.MuiTab-root", { hasText: /^Sections \(/ })
      .allTextContents();
    expect(labels.length).toBeGreaterThan(0);
    expect(new Set(labels).size).toBe(1);
  });

  test("sections whose water status fails are left out and counted", async ({
    page,
  }) => {
    await page.route("**/water-status", (route) =>
      route.fulfill({ status: 500, json: { error: { code: "x" } } }),
    );
    await openSearch(page, "&q=Test");
    await expect.poll(() => tabCount(page, "Sections")).toBeGreaterThan(1);
    const all = await tabCount(page, "Sections");
    await chip(page, /^Water/).click();
    await sheet(page)
      .getByRole("button", { name: "High", exact: true })
      .click();
    await page.keyboard.press("Escape");
    await expect(
      seen(page.getByRole("status")).filter({
        hasText: /^Water level unknown for \d+ sections\.$/,
      }),
    ).toBeVisible();
    expect(all).toBeGreaterThan(1);
    await expect.poll(() => tabCount(page, "Sections")).toBe(0);
  });

  test("water status requests run at most six at a time", async ({ page }) => {
    let active = 0;
    let peak = 0;
    await page.route("**/water-status", async (route) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 150));
      active--;
      await route.continue();
    });
    await openSearch(page, "&q=Test");
    await expect.poll(() => tabCount(page, "Sections")).toBeGreaterThan(1);
    await chip(page, /^Water/).click();
    await sheet(page)
      .getByRole("button", { name: "High", exact: true })
      .click();
    await expect.poll(() => rowLevels(page)).toEqual(["high"]);
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(6);
  });

  test("an unknown water value in the URL is ignored", async ({ page }) => {
    await openSearch(page, "&q=Test&water=%5B%22bogus%22%5D");
    await expect.poll(() => tabCount(page, "Sections")).toBeGreaterThan(1);
    expect(await computed(chip(page, /^Water/), "color")).not.toBe(TEAL);
  });

  test("Reset clears the filters", async ({ page }) => {
    await openSearch(page, "&q=Test&min_diff=3&country=AT");
    await chip(page, /^Grade III/).click();
    await sheet(page).getByRole("button", { name: "Reset" }).click();
    await expect(sheet(page).getByLabel("Min grade")).toHaveValue("");
    await expect(sheet(page).getByLabel("Country")).toHaveValue("");
    await page.keyboard.press("Escape");
    await expect(chip(page, "Grade")).toBeVisible();
    await expect(page).not.toHaveURL(/min_diff/);
  });
});

test.describe("results", () => {
  test("Sections come first, Rivers second", async ({ page }) => {
    await openSearch(page, "&q=Test");
    const tabs = seen(page.getByRole("tab", { name: /^(Sections|Rivers) \(/ }));
    await expect(tabs).toHaveCount(2);
    await expect(tabs.first()).toHaveText(/^Sections \(/);
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
    await expect(tabs.nth(1)).toHaveText(/^Rivers \(\d+\)$/);
    await tabs.nth(1).click();
    await expect(seen(page.getByText("Test River")).first()).toBeVisible();
  });
});

test.describe("section rows", () => {
  test("@small a row is a card on a phone and a ruled row in the desktop card: section, river, grade and the level pill", async ({
    page,
  }, info) => {
    await openSearch(page, "&q=Lower");
    const row = seen(
      page.getByTestId("search-section-row").filter({ hasText: "Lower Test" }),
    ).first();
    await expect(row).toBeVisible();
    // The river sits on the row, so no river heading separates the rows.
    await expect(row.getByText("Test River", { exact: true })).toBeVisible();
    await expect(row.getByText("III", { exact: true })).toBeVisible();
    await expect(row.locator("[data-level]")).toHaveCount(1);
    if (info.project.name === "desktop") {
      expect(await computed(row, "border-top-left-radius")).toBe("0px");
      expect(await computed(row, "box-shadow")).toBe("none");
      expect(await computed(row, "border-bottom-width")).toBe("1px");
    } else {
      expect(await computed(row, "border-top-left-radius")).toBe("14px");
    }
    expect(
      Number.parseFloat(await computed(row, "height")),
    ).toBeGreaterThanOrEqual(64);
    const name = await row
      .getByText("Lower Test", { exact: true })
      .boundingBox();
    const river = await row
      .getByText("Test River", { exact: true })
      .boundingBox();
    const pill = await row.locator("[data-level]").boundingBox();
    expect(river?.y).toBeGreaterThan(name?.y ?? 0);
    expect(pill?.x).toBeGreaterThan((river?.x ?? 0) + (river?.width ?? 0) - 1);
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("area mode", () => {
  test("@small the slider and the hint lead the panel, with no map preview", async ({
    page,
  }, info) => {
    await openSearch(page, "&mode=area");
    // A finger taps, a pointer clicks.
    const verb = info.project.name === "desktop" ? "Click" : "Tap";
    await expect(
      seen(page.getByText(`${verb} the map to move the search center.`)),
    ).toBeVisible();
    const slider = seen(page.getByRole("slider"));
    await expect(slider).toBeVisible();
    const thumb = seen(page.locator(".MuiSlider-thumb"));
    const t = await thumb.boundingBox();
    // The thumb element is the 44px hit area around the 28px dot.
    expect(t?.width).toBe(44);
    expect(t?.height).toBe(44);
    const root = await seen(page.locator(".MuiSlider-root")).boundingBox();
    expect(root?.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByTestId("area-map-card")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test("@small the slider is live and Country is a chip", async ({ page }) => {
    await openSearch(page, "&mode=area");
    await expect(seen(page.getByRole("slider"))).toBeEnabled();
    await expect(seen(page.getByText("10 km", { exact: true }))).toBeVisible();
    await seen(page.getByRole("slider")).focus();
    for (let i = 0; i < 2; i++) await page.keyboard.press("PageUp");
    const km = await seen(page.getByRole("slider")).inputValue();
    expect(Number(km)).toBeGreaterThan(10);
    await expect(
      seen(page.getByText(`${km} km`, { exact: true })),
    ).toBeVisible();
    const track = seen(page.locator(".MuiSlider-track"));
    expect(await computed(track, "background-color")).toBe(TEAL);
    await expect(chip(page, "Grade")).toBeVisible();
    await expect(chip(page, "Country")).toBeVisible();
    await expect(chip(page, /^Water/)).toBeVisible();
  });
});

test.describe("region mode", () => {
  test("@small the field, the hint and the grouped suggestions", async ({
    page,
  }) => {
    await openSearch(page, "&mode=region");
    const field = regionField(page);
    await expect(field).toBeVisible();
    expect(await computed(field, "font-size")).toBe("16px");
    // Before a pick the map is the way in: the hint says so, the levels are
    // chips; typing swaps them for the list.
    await expect(
      seen(page.getByText(/a region on the map, or search one by name\./)),
    ).toBeVisible();
    await expect(chip(page, "Valleys")).toBeVisible();
    await field.fill("Wald");
    await expect(
      seen(page.getByText("Type a valley, district, state or range")),
    ).toBeVisible();
    // Facets step aside while regions are listed.
    const groups = seen(page.getByTestId("region-group"));
    await expect(groups.first()).toBeVisible();
    const heads = await groups.evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-label")),
    );
    expect(heads.slice(0, 3)).toEqual([
      "Valleys",
      "Districts",
      "Mountain ranges",
    ]);
    await expect(chip(page, "Grade")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test("@small suggestion rows read from the left and the hint stays", async ({
    page,
  }) => {
    await openSearch(page, "&mode=region");
    await regionField(page).fill("Wald");
    await expect(
      seen(page.getByText("Type a valley, district, state or range")),
    ).toBeVisible();
    const row = seen(page.getByTestId("region-option")).first();
    const rowBox = await row.boundingBox();
    const nameBox = await row.locator("p").first().boundingBox();
    expect((nameBox?.x ?? 0) - (rowBox?.x ?? 0)).toBeLessThan(24);
  });

  test("picking a region returns to the results with the region as a chip", async ({
    page,
  }) => {
    await openSearch(page, "&mode=region");
    await regionField(page).fill("Wald");
    const option = seen(page.getByTestId("region-option")).first();
    const name = await option.getAttribute("data-name");
    await option.click();
    await expect(page).toHaveURL(/region=\d+/);
    await expect(seen(page.getByTestId("region-group"))).toHaveCount(0);
    await expect(chip(page, name ?? "")).toBeVisible();
    await expect(chip(page, "Grade")).toBeVisible();
    await expect(
      seen(page.getByRole("tab", { name: /^Sections/ })),
    ).toBeVisible();
    // Typing again lists regions again, and the facets step aside again.
    await regionField(page).fill("Wald");
    await expect(seen(page.getByTestId("region-group")).first()).toBeVisible();
    await expect(chip(page, "Grade")).toHaveCount(0);
  });
});

test.describe("search fixes", () => {
  test("Water now alone is a search and the water param takes the comma form", async ({
    page,
  }) => {
    await openSearch(page, "&water=low,high");
    await expect(
      seen(page.getByText("Type a name, country or difficulty to search")),
    ).toHaveCount(0);
    await expect(
      seen(page.getByRole("tab", { name: /^Sections/ })),
    ).toBeVisible();
    await expect(chip(page, /^Water low, high$/)).toBeVisible();
    await chip(page, /^Water/).click();
    await sheet(page)
      .getByRole("button", { name: "Medium", exact: true })
      .click();
    // One written form: comma separated, in a fixed order.
    await expect(page).toHaveURL(
      /water=low%2Cmedium%2Chigh|water=low,medium,high/,
    );
  });

  test("the Sections and Rivers counts follow Water now, and the sheet counts the open tab", async ({
    page,
  }) => {
    await openSearch(page, "&q=Test&water=high");
    await expect.poll(() => rowLevels(page)).toEqual(["high"]);
    const sections = await tabCount(page, "Sections");
    const rivers = await tabCount(page, "Rivers");
    expect(rivers).toBeGreaterThan(0);
    expect(rivers).toBeLessThanOrEqual(sections);
    const done = () =>
      sheet(page).getByRole("button", { name: /^\d+ results?$/ });
    const label = (n: number) => `${n} result${n === 1 ? "" : "s"}`;
    await chip(page, /^Water/).click();
    await expect(done()).toHaveText(label(sections));
    await page.keyboard.press("Escape");
    await seen(
      page.locator("button.MuiTab-root", { hasText: /^Rivers/ }),
    ).click();
    await chip(page, /^Water/).click();
    await expect(done()).toHaveText(label(rivers));
  });

  test("no empty copy while a search loads", async ({ page }) => {
    // Hold back the rivers and, separately, their sections.
    await page.route(
      /\/api\/v1\/waterways(\?|\/\d+\/sections)/,
      async (route) => {
        await new Promise((r) => setTimeout(r, 1200));
        await route.continue();
      },
    );
    await page.goto("/?panel=1&q=Test");
    await appReady(page);
    // Sample the pane while the request is held back.
    for (let i = 0; i < 16; i++) {
      await page.waitForTimeout(250);
      // One read per sample: an auto-retrying assertion would wait the copy out.
      const text = await seen(page.getByTestId("search-pane")).innerText();
      expect(text).not.toContain("No sections found.");
      expect(text).not.toContain("No rivers found.");
    }
    await expect.poll(() => tabCount(page, "Sections")).toBeGreaterThan(0);
  });

  test("the grade range never inverts", async ({ page }) => {
    await openSearch(page, "&q=Test");
    await chip(page, "Grade").click();
    await sheet(page).getByLabel("Max grade").selectOption({ label: "II" });
    await sheet(page).getByLabel("Min grade").selectOption({ label: "IV" });
    await expect(sheet(page).getByLabel("Max grade")).toHaveValue("4");
    await sheet(page).getByLabel("Max grade").selectOption({ label: "III" });
    await expect(sheet(page).getByLabel("Min grade")).toHaveValue("3");
  });

  test("chips have no arrow, name their value and open the sheet at their field", async ({
    page,
  }) => {
    await openSearch(page, "&q=Test&min_diff=3&max_diff=4&country=AT");
    await expect(
      seen(page.locator('.MuiChip-root [data-testid="KeyboardArrowDownIcon"]')),
    ).toHaveCount(0);
    await expect(chip(page, /^Grade III-IV$/)).toBeVisible();
    expect(await computed(chip(page, /^Grade III-IV$/), "color")).toBe(TEAL);
    await expect(chip(page, /^AT$/)).toBeVisible();
    await chip(page, /^AT$/).getByText("AT").click();
    await expect(sheet(page).getByLabel("Country")).toBeInViewport();
  });

  test("the X on a picked region clears it", async ({ page }) => {
    await openSearch(page, "&mode=region&region=3");
    const picked = seen(page.getByTestId("region-chip"));
    await expect(picked).toBeVisible();
    await picked.locator('[data-testid="CancelIcon"]').click();
    await expect(page).not.toHaveURL(/region=/);
    await expect(picked).toHaveCount(0);
    await expect(regionField(page)).toHaveValue("");
  });

  test("@small a picked region leaves no sideways scroll", async ({ page }) => {
    await page.goto("/?mode=region&region=3");
    await appReady(page);
    await expect(seen(page.getByTestId("region-chip"))).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("a set chip clears with its X and the sheet has a Close", async ({
    page,
  }) => {
    await openSearch(page, "&q=Test&min_diff=3&country=AT&water=low");
    await chip(page, /^AT$/).locator('[data-testid="CancelIcon"]').click();
    await expect(page).not.toHaveURL(/country=/);
    await chip(page, /^Grade III\+$/)
      .locator('[data-testid="CancelIcon"]')
      .click();
    await expect(page).not.toHaveURL(/min_diff=/);
    await chip(page, /^Water low$/)
      .locator('[data-testid="CancelIcon"]')
      .click();
    await expect(page).not.toHaveURL(/water=/);
    await chip(page, "Grade").click();
    await sheet(page).getByRole("button", { name: "Close" }).click();
    await expect(sheet(page)).toHaveCount(0);
  });
});
