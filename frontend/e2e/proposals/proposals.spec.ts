import { expect, type Page, test } from "@playwright/test";
import { computed, expectNoHorizontalOverflow } from "../support/fixture";

// WP11: proposals list, detail and review. Fixture proposals 9701 to 9707 are
// pending; a review is never sent for real, the PATCH is fulfilled here.

const FEATURE_CREATE = 9701;
const FEATURE_UPDATE = 9706;

const card = (page: Page, name: string) =>
  page
    .getByTestId("proposal-card")
    .filter({ hasText: name })
    .filter({ visible: true });

/** Any text on the page that is uppercase or tracked. */
async function loudText(page: Page) {
  return page
    .locator("main, body")
    .first()
    .evaluate((root) => {
      const out: string[] = [];
      for (const el of root.querySelectorAll("*")) {
        const s = getComputedStyle(el);
        if (!el.textContent?.trim()) continue;
        if (s.textTransform === "uppercase")
          out.push(`${el.tagName} uppercase`);
        // Tracked-out capitals are loud; the headings' slight negative
        // tracking is part of the type scale.
        if (Number.parseFloat(s.letterSpacing) > 0)
          out.push(`${el.tagName} ${s.letterSpacing}`);
      }
      return out;
    });
}

test.describe("proposal list", () => {
  test("cards show title, kind, votes and a sentence case status", async ({
    page,
  }) => {
    await page.goto("/proposals?status=pending");
    const c = card(page, "Mittelschwall");
    await expect(c).toBeVisible();
    await expect(c).toContainText("Create · Feature");
    await expect(c.getByTestId("proposal-status")).toHaveText("Pending");
    expect(
      await computed(c.getByTestId("proposal-status"), "text-transform"),
    ).toBe("none");
  });

  test("approved and rejected read as words, not capitals", async ({
    page,
  }) => {
    const base = {
      entity_type: "waterway",
      operation: "create",
      proposed_data: { name: "Somewhere" },
      submitted_by: "x",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      upvotes: 0,
      downvotes: 0,
    };
    await page.route("**/api/v1/proposals?*", (r) =>
      r.fulfill({
        json: [
          { ...base, id: 1, status: "approved" },
          { ...base, id: 2, status: "rejected" },
        ],
      }),
    );
    await page.goto("/proposals?status=approved");
    const chips = page.getByTestId("proposal-status").filter({ visible: true });
    await expect(chips).toHaveText(["Approved", "Rejected"]);
    await expect(
      page.getByRole("tab", { name: "Approved", exact: true }),
    ).toBeVisible();
  });

  test("no tracked or uppercase text", async ({ page }) => {
    await page.goto("/proposals?status=pending");
    await expect(card(page, "Mittelschwall")).toBeVisible();
    expect(await loudText(page)).toEqual([]);
  });

  test("fits a small phone @small", async ({ page }) => {
    await page.goto("/proposals?status=pending");
    await expect(card(page, "Mittelschwall")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("proposal detail", () => {
  test("an update shows before and after rows", async ({ page }) => {
    await page.goto(`/proposals/${FEATURE_UPDATE}`);
    const name = page
      .getByTestId("diff-row")
      .filter({ hasText: "name" })
      .first();
    await expect(name.getByTestId("diff-before")).toHaveText("Altes Wehr");
    await expect(name.getByTestId("diff-after")).toHaveText(
      "Altes Wehr (portage right)",
    );
    expect(await loudText(page)).toEqual([]);
  });

  test("author and status are named", async ({ page }) => {
    await page.route(`**/api/v1/proposals/${FEATURE_CREATE}`, async (r) => {
      const res = await r.fetch();
      const body = await res.json();
      await r.fulfill({
        json: {
          ...body,
          submitted_by: "someone-else",
          submitted_by_name: "jonas",
          reviewed_by_name: null,
        },
      });
    });
    await page.goto(`/proposals/${FEATURE_CREATE}`);
    await expect(page.getByTestId("proposal-status")).toHaveText("Pending");
    await expect(page.getByText("Proposed by jonas")).toBeVisible();
  });

  test("approve opens a confirmation and sends the review", async ({
    page,
  }) => {
    const sent: unknown[] = [];
    await page.route(`**/api/v1/proposals/${FEATURE_CREATE}`, async (r) => {
      if (r.request().method() !== "PATCH") return r.continue();
      sent.push(r.request().postDataJSON());
      const res = await r.fetch({ method: "GET" });
      const body = await res.json();
      await r.fulfill({ json: { ...body, status: "approved" } });
    });
    await page.goto(`/proposals/${FEATURE_CREATE}`);
    await page.getByRole("button", { name: "Approve" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Approve proposal?");
    await dialog.getByLabel("Note (optional)").fill("Looks right");
    await dialog.getByRole("button", { name: "Approve" }).click();
    await expect(dialog).toBeHidden();
    expect(sent).toEqual([{ status: "approved", review_note: "Looks right" }]);
  });

  test("reject sends a rejection and cancel sends nothing", async ({
    page,
  }) => {
    const sent: unknown[] = [];
    await page.route(`**/api/v1/proposals/${FEATURE_CREATE}`, async (r) => {
      if (r.request().method() !== "PATCH") return r.continue();
      sent.push(r.request().postDataJSON());
      const res = await r.fetch({ method: "GET" });
      await r.fulfill({
        json: { ...(await res.json()), status: "rejected" },
      });
    });
    await page.goto(`/proposals/${FEATURE_CREATE}`);
    await page.getByRole("button", { name: "Reject" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancel" })
      .click();
    await expect(page.getByRole("dialog")).toBeHidden();
    expect(sent).toEqual([]);
    await page.getByRole("button", { name: "Reject" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Reject" })
      .click();
    await expect(page.getByRole("dialog")).toBeHidden();
    expect(sent).toEqual([{ status: "rejected", review_note: null }]);
  });

  test("fits a small phone @small", async ({ page }) => {
    await page.goto(`/proposals/${FEATURE_UPDATE}`);
    await expect(page.getByTestId("diff-row").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("desktop pane", () => {
  test("a selected proposal opens beside the list", async ({
    page,
    isMobile,
  }) => {
    test.skip(!!isMobile, "two panes start at md");
    await page.goto("/proposals?status=pending");
    await card(page, "Mittelschwall").click();
    await expect(page).toHaveURL(/selected=9701/);
    await expect(page.getByTestId("proposal-detail")).toContainText(
      "Mittelschwall",
    );
    // The pane keeps the title and drops only the back arrow.
    const detail = page.getByTestId("proposal-detail");
    await expect(detail.getByText(/Mittelschwall/).first()).toBeVisible();
    await expect(detail.getByRole("button", { name: "Back" })).toHaveCount(0);
  });
});
