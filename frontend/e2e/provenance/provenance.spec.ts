import { expect, type Page, test } from "@playwright/test";
import { Finger } from "../support/finger";
import {
  computed,
  expectNoHorizontalOverflow,
  gotoSection,
} from "../support/fixture";

// The History and Sources views on their real mounts: the Sources tab of a
// section and the History entry of the feature menus. The mount tests
// read the real API; the content tests serve a richer history than the
// fixture has (an import, a proposal, a deletion) through route mocks.

test.use({ hasTouch: true });

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

const proposal = (over: Record<string, unknown>) => ({
  id: 50,
  created_at: days(1),
  updated_at: days(1),
  entity_type: "water_section",
  entity_id: 9102,
  operation: "update",
  original_data: { name: "Lower Test" },
  proposed_data: { name: "Lower Test Run" },
  submitted_by: "u-jonas",
  submitted_by_name: "jonas",
  reviewed_by: null,
  reviewed_by_name: null,
  review_note: null,
  status: "pending",
  upvotes: 3,
  downvotes: 0,
  user_vote: null,
  ...over,
});

const proposals = [
  proposal({}),
  proposal({
    id: 45,
    status: "approved",
    review_note: "Name as on the sign.",
    reviewed_by_name: "vincent",
  }),
  proposal({
    id: 51,
    status: "rejected",
    review_note: "Not on the map.",
    reviewed_by_name: "vincent",
  }),
];

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
  await page.route("**/api/v1/proposals?*", (r) =>
    r.fulfill({ json: proposals }),
  );
}

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;

/** The panel renders once per layout; only the visible one counts. */
const vis = (page: Page, id: string) =>
  page.getByTestId(id).filter({ visible: true });

const historyPanel = (page: Page) =>
  page.getByTestId(isPhone(page) ? "history-panel" : "history-pane");

/** The section's history through its header menu, the way a reader opens it. */
async function openHistory(page: Page) {
  await gotoSection(page, "lower");
  const card = page.getByTestId("features-card").filter({ visible: true });
  await card.getByRole("button", { name: "Feature list actions" }).click();
  await page.getByRole("menuitem", { name: "History" }).click();
}

async function openSources(page: Page) {
  await gotoSection(page, "lower");
  await page.getByRole("tab", { name: "Sources", exact: true }).click();
}

test.describe("history mount", () => {
  test("the section menu opens the real history", async ({ page }) => {
    await openHistory(page);
    const steps = page.getByTestId("history-step");
    await expect(steps.first()).toContainText("Imported from Rivermap");
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

  test("its own panel with a back arrow, on both layouts", async ({ page }) => {
    await openHistory(page);
    await expect(page.getByTestId("history-step").first()).toBeVisible();
    const panel = historyPanel(page);
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("button", { name: "Cancel" })).toHaveCount(0);
    await panel.getByRole("button", { name: "Back" }).click();
    await expect(panel).toHaveCount(0);
    await expect(
      page.getByTestId("features-card").filter({ visible: true }),
    ).toBeVisible();
  });
});

test.describe("history", () => {
  test("steps run oldest first, titled by what happened", async ({ page }) => {
    await serve(page);
    await openHistory(page);
    const steps = page.getByTestId("history-step");
    await expect(steps).toHaveCount(4);
    await expect(steps.nth(0)).toContainText("Imported from Rivermap");
    await expect(steps.nth(1)).toContainText("Changed");
    await expect(steps.nth(1)).toContainText(
      "Proposed by mara, approved by vincent",
    );
    await expect(steps.nth(2)).toContainText("by vincent");
    await expect(steps.nth(3)).toContainText("Deleted");
  });

  test("an origin without a source says so", async ({ page }) => {
    await page.route("**/api/v1/waterways/**/history*", (r) =>
      r.fulfill({
        json: {
          ...history,
          items: [{ ...history.items[0], source: null }],
          total: 1,
        },
      }),
    );
    await openHistory(page);
    await expect(page.getByTestId("history-step")).toContainText(
      "Origin not recorded",
    );
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

  test("the date is absolute in the by-line, titles are medium weight", async ({
    page,
  }) => {
    await serve(page);
    await openHistory(page);
    const when = page.getByTestId("history-when").nth(1);
    await expect(when).toHaveText(/\d{1,2} \w+ \d{4}/);
    const title = page.getByTestId("history-step").nth(1).locator("p").first();
    expect(await computed(title, "font-weight")).toBe("500");
  });

  test("dots are 12px: grey hollow at the origin, teal filled after", async ({
    page,
  }) => {
    await serve(page);
    await openHistory(page);
    const dots = page.getByTestId("history-dot");
    await expect(dots.nth(0)).toHaveAttribute("data-kind", "origin");
    await expect(dots.nth(1)).toHaveAttribute("data-kind", "done");
    await expect(dots.last()).toHaveAttribute("data-kind", "pending");
    expect(await computed(dots.nth(0), "width")).toBe("12px");
    expect(await computed(dots.nth(0), "background-color")).toBe(
      "rgb(255, 255, 255)",
    );
    expect(await computed(dots.nth(1), "background-color")).toBe(
      "rgb(14, 116, 144)",
    );
  });

  test("changes sit in a 76px key column with words for values", async ({
    page,
  }) => {
    await serve(page);
    await openHistory(page);
    const change = page.getByTestId("history-change").first();
    await expect(change).toContainText("Name");
    await expect(change.getByTestId("change-before")).toHaveText("Altes Wehr");
    await expect(change.getByTestId("change-after")).toHaveText("Old weir");
    expect(await computed(change, "grid-template-columns")).toMatch(/^76px /);
    const type = page.getByTestId("history-step").nth(2);
    await expect(type).toContainText("Type");
    await expect(type.getByTestId("change-after").first()).toHaveText("Hole");
    expect(
      await computed(
        change.getByTestId("change-before"),
        "text-decoration-line",
      ),
    ).toBe("line-through");
  });

  test("an open proposal is a hollow step with the reviewer's buttons", async ({
    page,
  }) => {
    await serve(page);
    await openHistory(page);
    const open = page.getByTestId("history-proposal").first();
    await expect(open).toContainText("Proposed change");
    await expect(open).toContainText("Pending");
    await expect(open).toContainText("by jonas");
    await expect(open).toContainText("3 up, 0 down");
    await expect(open.getByTestId("change-after")).toHaveText("Lower Test Run");
    for (const name of ["Reject", "Approve"]) {
      const box = await open.getByRole("button", { name }).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });

  test("the reviewer's note sits under the accepted step", async ({ page }) => {
    await serve(page);
    await openHistory(page);
    await expect(
      page.getByTestId("history-step").nth(1).getByTestId("review-note"),
    ).toHaveText("Name as on the sign.");
  });

  test("rejected proposals fold behind one row", async ({ page }) => {
    await serve(page);
    await openHistory(page);
    await expect(page.getByTestId("history-proposal")).toHaveCount(1);
    const fold = page.getByTestId("rejected-fold");
    await expect(fold).toHaveText("Show rejected (1)");
    expect((await fold.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48);
    await fold.click();
    await expect(page.getByTestId("history-proposal")).toHaveCount(2);
    await expect(page.getByText("Not on the map.")).toBeVisible();
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
    await page.route("**/api/v1/proposals?*", (r) => r.fulfill({ json: [] }));
    await openHistory(page);
    await expect(page.getByText("No history yet.")).toBeVisible();
  });
});

test.describe("sources", () => {
  test("the section panel has a Sources tab after Notes", async ({ page }) => {
    await gotoSection(page, "lower");
    const tabs = page.getByRole("tab").filter({ visible: true });
    await expect(tabs).toHaveText(["Features", "Logs", "Notes", "Sources"]);
  });

  test("a swipe from Notes reaches Sources", async ({ page }) => {
    await gotoSection(page, "lower");
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

  test("one card with a row per kind of data", async ({ page }) => {
    await page.route("**/api/v1/waterways/*/media*", (r) =>
      r.fulfill({
        json: [
          { id: 1, kind: "photo" },
          { id: 2, kind: "photo" },
          { id: 3, kind: "video" },
        ],
      }),
    );
    await openSources(page);
    const card = vis(page, "sources");
    await expect(card).toContainText("Sources");
    await expect(card).toContainText("Where this section's data comes from.");
    await expect(card.getByTestId("source-row").first()).toContainText(
      "Imported from Rivermap",
    );
    await expect(card.getByText("River line")).toBeVisible();
    await expect(card.getByText("OpenStreetMap")).toBeVisible();
    await expect(card.getByText("Features", { exact: true })).toBeVisible();
    await expect(card).toContainText("Data: THS");
    await expect(card.getByRole("link", { name: "CC BY 4.0" })).toBeVisible();
    await expect(card).toContainText("2 photos, 1 video");
    await expect(card.getByText("Contributors")).toHaveCount(0);
  });

  test("rows are 72px; the origin row opens its history", async ({ page }) => {
    await openSources(page);
    const row = vis(page, "source-row").first();
    expect((await row.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(72);
    await row.getByRole("button").click();
    await expect(page.getByTestId("history-step").first()).toBeVisible();
    await historyPanel(page).getByRole("button", { name: "Back" }).click();
    await expect(vis(page, "sources")).toBeVisible();
  });

  test("calm text, no sideways scroll @small", async ({ page }) => {
    await serve(page);
    await openSources(page);
    await expect(vis(page, "source-row").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(
      await computed(
        vis(page, "sources").locator("p").first(),
        "text-transform",
      ),
    ).toBe("none");
  });
});

test.describe("history container", () => {
  test("a feature's history is titled by the feature, with type, section and km", async ({
    page,
  }) => {
    await gotoSection(page, "lower");
    const list = page.getByTestId("features-card").filter({ visible: true });
    await list.locator("[data-row]").filter({ hasText: "Altes Wehr" }).click();
    await list.getByRole("button", { name: "More actions" }).first().click();
    await page.getByRole("menuitem", { name: "History" }).click();
    const panel = historyPanel(page);
    await expect(panel).toContainText("Altes Wehr");
    await expect(panel).toContainText(/Weir · Lower Test, \d+\.\d km/);
  });

  test("on a desktop it replaces the section view in the pane", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "desktop", "desktop only");
    await openHistory(page);
    const pane = page.getByTestId("history-pane");
    await expect(pane).toBeVisible();
    const side = await page.getByTestId("side-panel").boundingBox();
    const over = await pane.boundingBox();
    if (!side || !over) throw new Error("no boxes");
    expect(over.x).toBeCloseTo(side.x, 0);
    expect(over.y).toBeCloseTo(side.y, 0);
    expect(over.width).toBeCloseTo(side.width, 0);
    expect(over.height).toBeCloseTo(side.height, 0);
    // Nothing of the section shows through: its tabs are covered.
    const top = await page.evaluate(
      ({ x, y }) =>
        document
          .elementFromPoint(x, y)
          ?.closest("[data-testid]")
          ?.getAttribute("data-testid"),
      { x: side.x + side.width / 2, y: side.y + 12 },
    );
    expect(top).not.toBe("side-panel");
    await pane.getByRole("button", { name: "Back" }).click();
    await expect(pane).toHaveCount(0);
  });
});

test.describe("sources of a section", () => {
  test("it reads as the section's and opens the section's history", async ({
    page,
  }) => {
    await openSources(page);
    const card = vis(page, "sources");
    await expect(card).toContainText("Where this section's data comes from.");
    const origin = card.getByRole("button").filter({ hasText: "Section" });
    await expect(origin.first()).toBeVisible();
    await origin.first().click();
    const panel = historyPanel(page);
    await expect(panel).toContainText("Lower Test");
    await expect(panel.getByTestId("history-step").first()).toBeVisible();
  });
});
