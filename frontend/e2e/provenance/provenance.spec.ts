import { expect, type Page, test } from "@playwright/test";
import { Finger } from "../support/finger";
import {
  appReady,
  computed,
  expectNoHorizontalOverflow,
  gotoSection,
} from "../support/fixture";

// The History and Sources views on their real mounts: the Sources tab of the
// river panel and the History entry of the feature menus. The mount tests
// read the real API; the content tests serve a richer history than the
// fixture has (an import, a proposal, a deletion) through route mocks.

test.use({ hasTouch: true });

const WW = 9001;

const mara = { user_id: "u-mara", username: "mara" };
const vincent = { user_id: "u-vincent", username: "vincent" };
const rivermap = {
  id: "1",
  name: "Rivermap Alpine Rivers",
  short_name: "Rivermap",
  website: "https://rivermap.example",
  license_name: "CC BY-SA 4.0",
  license_url: "https://creativecommons.org/licenses/by-sa/4.0/",
};

const days = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toISOString().replace(/\.\d+Z$/, "Z");

const history = {
  items: [
    {
      id: 1,
      at: days(200),
      kind: "imported",
      actor: null,
      source: rivermap,
      proposal_id: null,
      reviewer: null,
      changes: [],
    },
    {
      id: 2,
      at: days(30),
      kind: "proposal_accepted",
      actor: mara,
      source: null,
      proposal_id: 45,
      reviewer: vincent,
      changes: [{ field: "name", before: "Altes Wehr", after: "Old weir" }],
    },
    {
      id: 3,
      at: days(3),
      kind: "edited",
      actor: vincent,
      source: null,
      proposal_id: null,
      reviewer: null,
      changes: [
        { field: "feature_type", before: "weir", after: "hole" },
        { field: "location", before: null, after: null },
      ],
    },
    {
      id: 4,
      at: days(1),
      kind: "deleted",
      actor: vincent,
      source: null,
      proposal_id: null,
      reviewer: null,
      changes: [],
    },
  ],
  page: 1,
  per_page: 100,
  total: 4,
  total_pages: 1,
};

const sources = {
  sources: [
    { source: rivermap, entries: 12 },
    {
      source: {
        id: "2",
        name: "OpenStreetMap contributors",
        short_name: "OSM",
        website: "https://www.openstreetmap.org",
        license_name: "ODbL 1.0",
        license_url: "https://opendatacommons.org/licenses/odbl/",
      },
      entries: 1,
    },
  ],
  contributors: [
    { user: mara, steps: 4, last_at: days(2) },
    { user: vincent, steps: 1, last_at: days(40) },
  ],
};

async function serve(page: Page) {
  await page.route("**/api/v1/waterways/*/**/history*", (r) =>
    r.fulfill({ json: history }),
  );
  await page.route("**/api/v1/waterways/*/history*", (r) =>
    r.fulfill({ json: history }),
  );
  await page.route("**/api/v1/waterways/*/sources", (r) =>
    r.fulfill({ json: sources }),
  );
}

/** The section's history through its header menu, the way a reader opens it. */
async function openHistory(page: Page) {
  await gotoSection(page, "lower");
  const card = page.getByTestId("features-card").filter({ visible: true });
  await card.getByRole("button", { name: "Section actions" }).click();
  await page.getByRole("menuitem", { name: "History" }).click();
}

async function openSources(page: Page) {
  await page.goto(`/?waterway=${WW}`);
  await appReady(page);
  await page.getByRole("tab", { name: "Sources", exact: true }).click();
}

test.describe("history mount", () => {
  test("the section menu opens the real history", async ({ page }) => {
    await openHistory(page);
    const steps = page.getByTestId("history-step");
    await expect(steps.first()).toContainText("Added");
    await expect(page.getByTestId("history-when").first()).toBeVisible();
  });

  test("a feature row's menu opens that feature's history", async ({
    page,
  }) => {
    await gotoSection(page, "lower");
    const card = page.getByTestId("features-card").filter({ visible: true });
    await card.locator("[data-row]").filter({ hasText: "Altes Wehr" }).click();
    await card.getByRole("button", { name: "More actions" }).first().click();
    await page.getByRole("menuitem", { name: "History" }).click();
    await expect(page.getByTestId("history-step").first()).toBeVisible();
  });

  test("a sheet on a phone, the pane on a desktop", async ({ page }) => {
    await openHistory(page);
    await expect(page.getByTestId("history-step").first()).toBeVisible();
    if (isPhone(page)) {
      const sheet = page.getByRole("dialog", { name: "History" });
      await expect(sheet).toBeVisible();
      await sheet.getByRole("button", { name: "Cancel" }).click();
      await expect(page.getByRole("dialog", { name: "History" })).toHaveCount(
        0,
      );
    } else {
      const pane = page.getByTestId("history-pane");
      await expect(pane).toBeVisible();
      await pane.getByRole("button", { name: "Back" }).click();
      await expect(pane).toHaveCount(0);
      await expect(
        page.getByTestId("features-card").filter({ visible: true }),
      ).toBeVisible();
    }
  });
});

test.describe("history", () => {
  test("steps run oldest first, import first and latest last", async ({
    page,
  }) => {
    await serve(page);
    await openHistory(page);
    const steps = page.getByTestId("history-step");
    await expect(steps).toHaveCount(4);
    await expect(steps.nth(0)).toContainText("Imported from Rivermap");
    await expect(steps.nth(1)).toContainText("Changed");
    await expect(steps.nth(1)).toContainText("mara");
    await expect(steps.nth(1)).toContainText("approved by vincent");
    await expect(steps.nth(3)).toContainText("Deleted");
    await expect(steps.nth(3)).toContainText("vincent");
  });

  test("the import names its licence as a link", async ({ page }) => {
    await serve(page);
    await openHistory(page);
    const link = page
      .getByTestId("history-step")
      .nth(0)
      .getByRole("link", { name: "CC BY-SA 4.0" });
    await expect(link).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by-sa/4.0/",
    );
  });

  test("changed fields are before and after lines", async ({ page }) => {
    await serve(page);
    await openHistory(page);
    const change = page.getByTestId("history-change").first();
    await expect(change).toContainText("Name");
    await expect(change.getByTestId("change-before")).toHaveText("Altes Wehr");
    await expect(change.getByTestId("change-after")).toHaveText("Old weir");
    await expect(page.getByTestId("history-step").nth(2)).toContainText(
      "Feature type",
    );
  });

  test("time is relative with the full date on hover", async ({ page }) => {
    await serve(page);
    await openHistory(page);
    const when = page.getByTestId("history-when").nth(1);
    await expect(when).toHaveText("4w ago");
    await expect(when).toHaveAttribute("title", /\d{4}/);
  });

  test("calm text and no sideways scroll @small", async ({ page }) => {
    await serve(page);
    await openHistory(page);
    await expect(page.getByTestId("history-step")).toHaveCount(4);
    await expectNoHorizontalOverflow(page);
    const bad = await page
      .getByTestId("history")
      .locator("*")
      .evaluateAll((els) =>
        els
          .filter((el) => {
            const s = getComputedStyle(el);
            return (
              s.textTransform === "uppercase" || s.letterSpacing !== "normal"
            );
          })
          .map((el) => el.tagName),
      );
    expect(bad, "uppercase or tracked text").toEqual([]);
    expect(await page.getByTestId("history").innerText()).not.toContain("—");
  });

  test("an empty history says so", async ({ page }) => {
    await page.route("**/api/v1/waterways/**/history*", (r) =>
      r.fulfill({
        json: { items: [], page: 1, per_page: 100, total: 0, total_pages: 0 },
      }),
    );
    await openHistory(page);
    await expect(page.getByText("No history yet.")).toBeVisible();
  });
});

test.describe("sources", () => {
  test("the river panel has a Sources tab after Notes", async ({ page }) => {
    await page.goto(`/?waterway=${WW}`);
    await appReady(page);
    const tabs = page.getByRole("tab").filter({ visible: true });
    await expect(tabs).toHaveText(["Sections", "Gauges", "Notes", "Sources"]);
  });

  test("a swipe from Notes reaches Sources", async ({ page }) => {
    await page.goto(`/?waterway=${WW}`);
    await appReady(page);
    await page.getByRole("tab", { name: "Notes", exact: true }).click();
    // From the tab bar, which carries the same gesture as the pane.
    const box = await page.getByRole("tablist").boundingBox();
    if (!box) throw new Error("no pane");
    const f = await Finger.down(
      page,
      box.x + box.width * 0.8,
      box.y + box.height / 2,
    );
    await f.moveBy(-box.width * 0.55);
    await f.up();
    await expect(
      page.getByRole("tab", { name: "Sources", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
  });

  test("the real contributors list is shown", async ({ page }) => {
    await openSources(page);
    await expect(vis(page, "contributor-row").first()).toBeVisible();
  });

  test("sources are cards with licence link, website and entry count", async ({
    page,
  }) => {
    await serve(page);
    await openSources(page);
    const cards = vis(page, "source-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText("Rivermap Alpine Rivers");
    await expect(cards.nth(0)).toContainText("12 entries");
    await expect(cards.nth(1)).toContainText("1 entry");
    await expect(
      cards.nth(0).getByRole("link", { name: "CC BY-SA 4.0" }),
    ).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by-sa/4.0/",
    );
    await expect(
      cards.nth(0).getByRole("link", { name: /rivermap\.example/ }),
    ).toHaveAttribute("href", "https://rivermap.example");
  });

  test("contributors are rows with steps and last change", async ({ page }) => {
    await serve(page);
    await openSources(page);
    const rows = vis(page, "contributor-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("mara");
    await expect(rows.nth(0)).toContainText("4 changes");
    await expect(rows.nth(0)).toContainText("2d ago");
    await expect(rows.nth(1)).toContainText("1 change");
  });

  test("rows are touch sized, text calm, no sideways scroll @small", async ({
    page,
  }) => {
    await serve(page);
    await openSources(page);
    await expect(vis(page, "source-card")).toHaveCount(2);
    await expectNoHorizontalOverflow(page);
    const rowHeight = await computed(
      vis(page, "contributor-row"),
      "min-height",
    );
    expect(parseFloat(rowHeight)).toBeGreaterThanOrEqual(44);
    expect(
      await computed(
        vis(page, "source-card").locator("h3, p").first(),
        "text-transform",
      ),
    ).toBe("none");
  });
});

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;

/** The panel renders once per layout; only the visible one counts. */
const vis = (page: Page, id: string) =>
  page.getByTestId(id).filter({ visible: true });
