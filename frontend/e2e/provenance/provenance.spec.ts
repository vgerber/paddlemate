import { expect, type Page, test } from "@playwright/test";
import { Finger } from "../support/finger";
import {
  computed,
  expectNoHorizontalOverflow,
  gotoSection,
} from "../support/fixture";

// Every edit of a section and its features in one place, the Sources tab:
// the unfiltered timeline, and the same view narrowed to one entry by the
// History entry of the feature menus. The mount tests read the real API;
// the content tests serve a richer history than the fixture has (an import,
// a proposal, a deletion) through route mocks.

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

/** The proposals list answers one page of this shape. */
const paged = (items: unknown[]) => ({
  items,
  page: 1,
  per_page: 100,
  total: items.length,
  total_pages: 1,
});

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
      proposal_note: "Name as on the bridge sign.",
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
    r.fulfill({ json: paged(proposals) }),
  );
}

/** The panel renders once per layout; only the visible one counts. */
const vis = (page: Page, id: string) =>
  page.getByTestId(id).filter({ visible: true });

const header = (page: Page) => vis(page, "edits-header");

/** The section's history the way a reader opens it: the Sources tab, then
 * its first row, narrowed to the section. */
async function openHistory(page: Page) {
  await gotoSection(page, "lower");
  await page.getByRole("tab", { name: "Sources", exact: true }).click();
  await vis(page, "sources").getByRole("button").first().click();
  await expect(header(page)).toBeVisible();
}

async function openSources(page: Page) {
  await gotoSection(page, "lower");
  await page.getByRole("tab", { name: "Sources", exact: true }).click();
}

test.describe("history mount", () => {
  test("the Sources tab opens the real history", async ({ page }) => {
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
    await card
      .getByRole("button", { name: "Feature actions", exact: true })
      .first()
      .click();
    await page.getByRole("menuitem", { name: "History" }).click();
    await expect(page.getByTestId("history-step").first()).toBeVisible();
  });

  test("it is the Sources tab with a header and a way back to all edits", async ({
    page,
  }) => {
    await openHistory(page);
    await expect(page.getByTestId("history-step").first()).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Sources", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(header(page)).toContainText("Lower Test");
    // No overlay of its own any more.
    await expect(page.getByTestId("history-panel")).toHaveCount(0);
    await expect(page.getByTestId("history-pane")).toHaveCount(0);
    const back = header(page).getByRole("button", { name: "All edits" });
    expect((await back.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await back.click();
    await expect(header(page)).toHaveCount(0);
    await expect(vis(page, "sources")).toBeVisible();
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

  test("the submitter's note sits under the accepted step", async ({
    page,
  }) => {
    await serve(page);
    await openHistory(page);
    await expect(
      page.getByTestId("history-step").nth(1).getByTestId("proposal-note"),
    ).toHaveText("Name as on the bridge sign.");
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
    await page.route("**/api/v1/proposals?*", (r) =>
      r.fulfill({ json: paged([]) }),
    );
    await openSources(page);
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
    await header(page).getByRole("button", { name: "All edits" }).click();
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

test.describe("history of a feature", () => {
  test("it is titled by the feature, with its type, and offers Edit feature", async ({
    page,
  }) => {
    await gotoSection(page, "lower");
    const list = page.getByTestId("features-card").filter({ visible: true });
    await list.locator("[data-row]").filter({ hasText: "Altes Wehr" }).click();
    await list
      .getByRole("button", { name: "Feature actions", exact: true })
      .first()
      .click();
    await page.getByRole("menuitem", { name: "History" }).click();
    await expect(header(page)).toContainText("Altes Wehr");
    await expect(header(page)).toContainText("Weir");
    const edit = header(page).getByRole("button", { name: "Edit feature" });
    await expect(edit).toBeVisible();
    expect((await edit.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    // Only this feature's steps: none of them names another entry.
    await expect(page.getByTestId("edit-entry")).toHaveCount(0);
  });

  test("the filter stays across tab switches", async ({ page }) => {
    await openHistory(page);
    await page.getByRole("tab", { name: "Features", exact: true }).click();
    await page.getByRole("tab", { name: "Sources", exact: true }).click();
    await expect(header(page)).toBeVisible();
    await header(page).getByRole("button", { name: "All edits" }).click();
    await expect(vis(page, "sources")).toBeVisible();
  });
});

test.describe("all edits", () => {
  test("one timeline names the entry of every step and opens it", async ({
    page,
  }) => {
    await openSources(page);
    const steps = page.getByTestId("history-step");
    await expect(steps.first()).toBeVisible();
    const entries = page.getByTestId("edit-entry");
    expect(await entries.count()).toBeGreaterThan(3);
    await expect(entries.filter({ hasText: "Section" }).first()).toBeVisible();
    await expect(
      entries.filter({ hasText: "Altes Wehr" }).first(),
    ).toContainText("Weir");
    const target = entries.filter({ hasText: "Altes Wehr" }).first();
    expect((await target.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(
      44,
    );
    await target.click();
    await expect(header(page)).toContainText("Altes Wehr");
    await expect(page.getByTestId("edit-entry")).toHaveCount(0);
  });

  test("steps run oldest first across entries", async ({ page }) => {
    await openSources(page);
    await expect(page.getByTestId("history-step").first()).toBeVisible();
    const dates = await page.getByTestId("history-when").allInnerTexts();
    const times = dates.map((d) => Date.parse(d));
    expect(times.length).toBeGreaterThan(3);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  test("open proposals of the features sit last, hollow", async ({ page }) => {
    await openSources(page);
    const open = page.getByTestId("history-proposal").first();
    await expect(open).toContainText("Pending");
    await expect(open.getByTestId("edit-entry")).toBeVisible();
    const last = page.getByTestId("history-dot").last();
    await expect(last).toHaveAttribute("data-kind", "pending");
  });

  test("the sources are counted for the section only", async ({ page }) => {
    const request = page.waitForRequest((r) =>
      /\/waterways\/\d+\/sources\?/.test(r.url()),
    );
    await openSources(page);
    expect((await request).url()).toContain("section_id=9102");
  });

  test("no sideways scroll @small", async ({ page }) => {
    await openSources(page);
    await expect(page.getByTestId("history-step").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("no overlay on either layout", async ({ page }) => {
    await openSources(page);
    await expect(page.getByTestId("history-step").first()).toBeVisible();
    await expect(page.getByTestId("history-panel")).toHaveCount(0);
    await expect(page.getByTestId("history-pane")).toHaveCount(0);
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
    await expect(header(page)).toContainText("Lower Test");
    await expect(page.getByTestId("history-step").first()).toBeVisible();
  });
});

test.describe("deleted features", () => {
  // The fixture's strainer 9595 is gone: its delete was approved, and its
  // history (created, edited, deleted) sits under the section it had.
  test("a deleted step is listed and opens the feature's history", async ({
    page,
  }) => {
    await openSources(page);
    const removed = vis(page, "history")
      .getByTestId("history-step")
      .filter({ hasText: "Strainer · Deleted feature" })
      .filter({ hasText: "Confirmed gone" });
    await expect(removed).toBeVisible();
    await expect(removed.getByTestId("history-dot")).toHaveAttribute(
      "data-kind",
      "gone",
    );
    await removed.getByTestId("edit-entry").click();
    await expect(header(page)).toContainText("Strainer");
    await expect(header(page)).toContainText("Deleted feature");
    await expect(
      header(page).getByRole("button", { name: "Edit feature" }),
    ).toHaveCount(0);
    const steps = vis(page, "history").getByTestId("history-step");
    await expect(steps).toHaveCount(3);
    await expect(steps.first()).toContainText("Added");
    await expect(steps.last()).toContainText("Deleted");
    await expect(steps.last()).toContainText("Confirmed gone");
    await header(page).getByRole("button", { name: "All edits" }).click();
    await expect(vis(page, "sources")).toBeVisible();
  });
});

test.describe("after a feature is deleted", () => {
  test("the Edits tab lists it without a reload", async ({ page }) => {
    let deleted = false;
    const gone = {
      deleted_at: days(0),
      deleted_by: vincent,
      feature_id: 9999,
      feature_type: "weir",
      name: "Altes Wehr",
      proposal_id: null,
      reviewer: null,
    };
    await page.route("**/api/v1/**/deleted-features*", (r) =>
      r.fulfill({
        json: {
          items: deleted ? [gone] : [],
          page: 1,
          per_page: 100,
          total: deleted ? 1 : 0,
          total_pages: 1,
        },
      }),
    );
    await page.route("**/features/9999/history*", (r) =>
      r.fulfill({
        json: {
          ...paged([
            {
              id: 91,
              at: days(0),
              kind: "deleted",
              actor: vincent,
              source: null,
              proposal_id: null,
              reviewer: null,
              changes: [],
            },
          ]),
        },
      }),
    );
    await page.route(/\/features\/\d+$/, (r) => {
      if (r.request().method() !== "DELETE") return r.fallback();
      deleted = true;
      return r.fulfill({ status: 204 });
    });
    await openSources(page);
    await expect(vis(page, "history")).toBeVisible();
    await expect(page.getByText("Deleted feature")).toHaveCount(0);

    await page.getByRole("tab", { name: "Features", exact: true }).click();
    const card = page.getByTestId("features-card").filter({ visible: true });
    await card.locator("[data-row]").filter({ hasText: "Altes Wehr" }).click();
    await card
      .getByRole("button", { name: "Feature actions", exact: true })
      .first()
      .click();
    await page.getByRole("menuitem", { name: "Delete feature" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.getByRole("tab", { name: "Sources", exact: true }).click();
    await expect(
      vis(page, "history")
        .getByTestId("history-step")
        .filter({ hasText: "Deleted feature" }),
    ).toBeVisible();
  });
});
