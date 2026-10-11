import { expect, type Page, test } from "@playwright/test";
import { computed, expectNoHorizontalOverflow } from "../support/fixture";

// WP11: the History and Sources views. The routes are served from fixtures
// that follow .claude/handoffs/2026-10-11-provenance-contract.md, since the
// views are mounted by the lead and the API is built in parallel.

const WW = 9001;
const SEC = 9102;
const FEAT = 9526;

const mara = { user_id: "u-mara", username: "mara" };
const vincent = { user_id: "u-vincent", username: "vincent" };
const rivermap = {
  id: 1,
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
        id: 2,
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

const view = (kind: "history" | "sources") =>
  `/admin/provenance-preview?view=${kind}&waterway=${WW}&section=${SEC}&feature=${FEAT}`;

test.describe("history", () => {
  test("steps run oldest first, import first and latest last", async ({
    page,
  }) => {
    await serve(page);
    await page.goto(view("history"));
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
    await page.goto(view("history"));
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
    await page.goto(view("history"));
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
    await page.goto(view("history"));
    const when = page.getByTestId("history-when").nth(1);
    await expect(when).toHaveText("4w ago");
    await expect(when).toHaveAttribute("title", /\d{4}/);
  });

  test("calm text and no sideways scroll @small", async ({ page }) => {
    await serve(page);
    await page.goto(view("history"));
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
    await page.goto(view("history"));
    await expect(page.getByText("No history yet.")).toBeVisible();
  });
});

test.describe("sources", () => {
  test("sources are cards with licence link, website and entry count", async ({
    page,
  }) => {
    await serve(page);
    await page.goto(view("sources"));
    const cards = page.getByTestId("source-card");
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
    await page.goto(view("sources"));
    const rows = page.getByTestId("contributor-row");
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
    await page.goto(view("sources"));
    await expect(page.getByTestId("source-card")).toHaveCount(2);
    await expectNoHorizontalOverflow(page);
    const rowHeight = await computed(
      page.getByTestId("contributor-row"),
      "min-height",
    );
    expect(parseFloat(rowHeight)).toBeGreaterThanOrEqual(44);
    expect(
      await computed(
        page.getByTestId("source-card").locator("h3, p").first(),
        "text-transform",
      ),
    ).toBe("none");
  });
});
