import { expect, type Page, test } from "@playwright/test";
import { mockRegions } from "../map/regions.mock";
import {
  appReady,
  expectNoHorizontalOverflow,
  expectTouchTargets,
  gotoSection,
} from "../support/fixture";

// Settings > Units: weight, distance and length, kept per device. The suite
// signs in with metric stored (auth.setup.ts); the default tests clear it.
// Fixture entries 9851-9860: the Testflow Cascade is 254-274 cm long, 295-345 l.

const UNITS_KEY = "pm-units";

const row = (page: Page, name: string) =>
  page
    .getByTestId("material-row")
    .filter({ hasText: name })
    .filter({ visible: true });

async function choose(page: Page, group: string, unit: string) {
  await page
    .getByRole("group", { name: group })
    .getByRole("button", { name: unit, exact: true })
    .click();
}

async function openUnits(page: Page) {
  await page.goto("/settings?group=units");
  await expect(page.getByRole("group", { name: "Length" })).toBeVisible();
}

async function clearStored(page: Page) {
  await page.goto("/settings?group=units");
  await page.evaluate((key) => localStorage.removeItem(key), UNITS_KEY);
  await page.reload();
  await expect(page.getByRole("group", { name: "Length" })).toBeVisible();
}

async function wikiRow(page: Page) {
  await page.goto("/materials?q=Cascade");
  await expect(row(page, "Testflow Cascade")).toBeVisible();
  return row(page, "Testflow Cascade");
}

test.describe("choosing units", () => {
  test("the section is there, with three groups and 44px targets", async ({
    page,
  }) => {
    await openUnits(page);
    for (const group of ["Weight", "Distance", "Length"]) {
      await expect(page.getByRole("group", { name: group })).toBeVisible();
    }
    await expect(
      page.getByRole("group", { name: "Length" }).getByRole("button", {
        name: "cm",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await expectTouchTargets(
      page.getByTestId("settings-detail").getByRole("button", {
        name: /^(kg|lb|km|mi|cm|in)$/,
      }),
    );
    await expectNoHorizontalOverflow(page);
  });

  test("length (and volume with it) changes the wiki and survives a reload @small", async ({
    page,
  }) => {
    await openUnits(page);
    await choose(page, "Length", "in");
    let cascade = await wikiRow(page);
    await expect(cascade).toContainText("Length 100-107.9 in");
    await expect(cascade).toContainText("Volume 77.9-91.1 gal");
    await page.reload();
    cascade = row(page, "Testflow Cascade");
    await expect(cascade).toContainText("Length 100-107.9 in");
    await openUnits(page);
    await choose(page, "Length", "cm");
    cascade = await wikiRow(page);
    await expect(cascade).toContainText("Length 254-274 cm");
    await expect(cascade).toContainText("Volume 295-345 l");
  });

  test("weight changes the paddler window and the filter chip", async ({
    page,
  }) => {
    await openUnits(page);
    await choose(page, "Weight", "lb");
    // The desktop chip also names its remove control.
    const chip = page.getByRole("button", { name: /^Fits 150 lb\b/ });
    await page.goto("/materials?fits=68.04");
    await expect(chip).toBeVisible();
    await page.reload();
    await expect(chip).toBeVisible();
    // The URL stays metric: 150 lb is 68.04 kg.
    await expect(page).toHaveURL(/fits=68\.04/);
    // The phone edits it in the Filters sheet, the desktop in the sidebar.
    if (test.info().project.name.startsWith("desktop")) {
      await expect(page.getByLabel("Fits paddler (lb)")).toHaveValue("150");
      return;
    }
    await page.getByTestId("filters-chip").click();
    await expect(
      page
        .getByRole("dialog", { name: "Filters" })
        .getByLabel("Fits paddler (lb)"),
    ).toHaveValue("150");
  });

  test("distance changes the feature positions and survives a reload", async ({
    page,
  }) => {
    await openUnits(page);
    await choose(page, "Distance", "mi");
    await gotoSection(page, "lower");
    const card = page.getByTestId("features-card").filter({ visible: true });
    const put = card.locator("[data-row]").filter({ hasText: "Put in" });
    await expect(put).toContainText("0.0 mi");
    await page.reload();
    await expect(put).toContainText("0.0 mi");
    await expect(card).not.toContainText(" km");
    await expectNoHorizontalOverflow(page);
  });

  test("distance changes the search radius label and value", async ({
    page,
  }) => {
    await openUnits(page);
    await choose(page, "Distance", "mi");
    await mockRegions(page);
    await page.goto("/?mode=area");
    await appReady(page);
    await expect(page).toHaveURL(/radius=10/);
    await expect(
      page.getByText("6 mi", { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("slider").filter({ visible: true }),
    ).toHaveAttribute("aria-valuenow", "6");
    await expect(
      page.getByRole("slider").filter({ visible: true }),
    ).toHaveAttribute("aria-valuemax", "124");
    // One step is a mile; the radius in the URL stays kilometres.
    await page
      .getByRole("slider")
      .filter({ visible: true })
      .press("ArrowRight");
    await expect(page).toHaveURL(/radius=11\.2/);
  });
});

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a visitor switches a unit and it holds after a reload", async ({
    page,
  }) => {
    await page.goto("/settings?group=units");
    await expect(page.getByRole("group", { name: "Length" })).toBeVisible();
    await choose(page, "Length", "in");
    await page.reload();
    await expect(
      page
        .getByRole("group", { name: "Length" })
        .getByRole("button", { name: "in", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.goto("/materials?q=Cascade");
    await expect(row(page, "Testflow Cascade")).toContainText(
      "Length 100-107.9 in",
    );
  });
});

test.describe("device default", () => {
  test.describe("US English", () => {
    test.use({ locale: "en-US" });

    test("starts imperial", async ({ page }) => {
      await clearStored(page);
      for (const [group, unit] of [
        ["Weight", "lb"],
        ["Distance", "mi"],
        ["Length", "in"],
      ]) {
        await expect(
          page
            .getByRole("group", { name: group })
            .getByRole("button", { name: unit, exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
      }
      await expect(await wikiRow(page)).toContainText("Length 100-107.9 in");
    });
  });

  test.describe("German", () => {
    test.use({ locale: "de-DE" });

    test("starts metric", async ({ page }) => {
      await clearStored(page);
      await expect(await wikiRow(page)).toContainText("Length 254-274 cm");
    });
  });
});

test.describe("entering imperial", () => {
  test("a wiki entry typed in inches and pounds is saved metric @write", async ({
    page,
  }) => {
    await openUnits(page);
    await choose(page, "Length", "in");
    await choose(page, "Weight", "lb");

    await page.goto("/materials/new");
    await page.getByLabel("Brand").fill("Unitprobe");
    await page.getByLabel("Model").fill("Beta");
    await page.getByLabel(/^Length \(in\)/).fill("100");
    await page.getByLabel(/^Weight \(lb\)/).fill("50");
    await page.getByRole("button", { name: "Save entry" }).click();
    await expect(
      page.getByRole("heading", { name: "Unitprobe Beta" }),
    ).toBeVisible();
    await expect(page.getByText("100 in")).toBeVisible();
    await expect(page.getByText("50 lb")).toBeVisible();

    // Back to metric: what was stored is 254 cm and 22.68 kg.
    await openUnits(page);
    await choose(page, "Length", "cm");
    await choose(page, "Weight", "kg");
    await page.goto("/materials?q=Unitprobe");
    const probe = row(page, "Unitprobe Beta");
    await expect(probe).toContainText("Length 254 cm");
    await expect(probe).toContainText("Weight 22.7 kg");

    // Editing in metric shows the stored numbers, and an untouched save keeps them.
    await probe.getByRole("button").first().click();
    await page.getByRole("button", { name: "Entry actions" }).click();
    await page.getByRole("menuitem", { name: "Edit entry" }).click();
    await expect(page.getByLabel(/^Length \(cm\)/)).toHaveValue("254");
    await expect(page.getByLabel(/^Weight \(kg\)/)).toHaveValue("22.68");

    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Entry actions" }).click();
    await page.getByRole("menuitem", { name: "Delete entry" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page).toHaveURL(/\/materials(\?|$)/);
    await page
      .getByRole("textbox", { name: "Brand or model" })
      .fill("Unitprobe");
    await expect(page.getByTestId("empty-state")).toBeVisible();
  });
});
