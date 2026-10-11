import { expect, type Page, test } from "@playwright/test";
import {
  computed,
  expectNoHorizontalOverflow,
  expectTouchTargets,
} from "../support/fixture";

// WP11: proposals list, detail and review. Fixture proposals 9701 to 9707 are
// pending; a review is never sent for real, the PATCH is fulfilled here.

const FEATURE_CREATE = 9701;
const FEATURE_UPDATE = 9706;
const FEATURE_CREATE_DESCRIBED = 9702;
const DESCRIBED_TEXT = "Sticky";

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
  test("cards show title, kind and votes, and no status chip", async ({
    page,
  }) => {
    await page.goto("/proposals?status=pending");
    const c = card(page, "Mittelschwall");
    await expect(c).toBeVisible();
    await expect(c).toContainText("Create · Feature");
    await expect(c.getByTestId("proposal-meta")).toContainText(/ago|now/);
    // The tab already says Pending.
    await expect(page.getByTestId("proposal-status")).toHaveCount(0);
  });

  test("kind and votes sit in a right column at 13px", async ({ page }) => {
    await page.route("**/api/v1/proposals?*", (r) =>
      r.fulfill({
        json: [
          {
            id: 1,
            status: "pending",
            entity_type: "waterway",
            operation: "create",
            proposed_data: { name: "Somewhere" },
            submitted_by: "x",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            upvotes: 1,
            downvotes: 0,
          },
        ],
      }),
    );
    await page.goto("/proposals?status=pending");
    const c = card(page, "Somewhere");
    const kind = c.getByText("Create · River");
    const meta = c.getByTestId("proposal-meta");
    await expect(meta).toContainText("▲ 1 · ▼ 0 · ");
    expect(await computed(kind, "font-size")).toBe("13px");
    expect(await computed(kind, "font-weight")).toBe("400");
    expect(await computed(meta, "font-weight")).toBe("500");
    const title = await c.getByText("Somewhere").boundingBox();
    const kindBox = await kind.boundingBox();
    expect(kindBox?.x ?? 0).toBeGreaterThan(
      (title?.x ?? 0) + (title?.width ?? 0) - 1,
    );
  });

  test("the list names its count in results", async ({ page }) => {
    await page.goto("/proposals?status=pending");
    await expect(card(page, "Mittelschwall")).toBeVisible();
    await expect(
      page.getByText(/^\d+ results?$/).filter({ visible: true }),
    ).toBeVisible();
  });

  test("the filter toggle is a 44px target and the filters are chips", async ({
    page,
  }) => {
    await page.goto("/proposals?status=pending");
    await expect(card(page, "Mittelschwall")).toBeVisible();
    const toggle = page.getByRole("button", { name: "Show filters" });
    await expectTouchTargets(toggle);
    await toggle.click();
    const typeChip = page.getByTestId("proposal-entity");
    await expect(typeChip).toBeVisible();
    // 32px to look at; the theme draws the rest of the 44px hit area.
    expect(await typeChip.evaluate((el) => el.tagName)).not.toBe("SELECT");
    await typeChip.click();
    await page.getByRole("menuitem", { name: "Features" }).click();
    await expect(typeChip).toContainText("Type: Features");
    await expect(card(page, "Proposed Test Creek")).toHaveCount(0);
    await expect(card(page, "Mittelschwall")).toBeVisible();
  });

  test("the filter chip hit area is 44px tall", async ({ page }) => {
    await page.goto("/proposals?status=pending&entity_type=feature");
    const chip = page.getByTestId("proposal-entity");
    await expect(chip).toBeVisible();
    // 32px to look at, the theme's ::after draws the rest of the 44px.
    const hit = await chip.evaluate((el) => {
      const after = getComputedStyle(el, "::after");
      return (
        el.getBoundingClientRect().height - Number.parseFloat(after.top) * 2
      );
    });
    expect(hit).toBeGreaterThanOrEqual(44);
  });

  test("cards are 14px padded, 8px apart", async ({ page }) => {
    await page.goto("/proposals?status=pending");
    const cards = page.getByTestId("proposal-card").filter({ visible: true });
    await expect(cards.first()).toBeVisible();
    expect(await computed(cards.first(), "padding-left")).toBe("14px");
    const [a, b] = await Promise.all([
      cards.nth(0).boundingBox(),
      cards.nth(1).boundingBox(),
    ]);
    if (!a || !b) throw new Error("no boxes");
    expect(Math.round(b.y - (a.y + a.height))).toBe(8);
  });

  test("a keyboard focus ring shows on a card", async ({ page }) => {
    await page.goto("/proposals?status=pending");
    await expect(card(page, "Mittelschwall")).toBeVisible();
    const focused = () =>
      page.evaluate(
        () =>
          document.activeElement?.getAttribute("data-testid") ===
          "proposal-card",
      );
    for (let i = 0; i < 40 && !(await focused()); i++) {
      await page.keyboard.press("Tab");
    }
    expect(await focused()).toBe(true);
    const outline = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement as Element);
      return `${s.outlineStyle} ${s.outlineWidth}`;
    });
    expect(outline).toBe("solid 2px");
  });

  test("a phone list has a header that goes back", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "the desktop list has no header");
    await page.goto("/proposals?status=pending");
    await expect(
      page.getByRole("heading", { name: "Proposals" }),
    ).toBeVisible();
    await expectTouchTargets(page.getByRole("button", { name: "Back" }));
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

test.describe("proposal diff", () => {
  const UPDATE_SECTION = 9705;

  test("values read in words, one row per field", async ({ page }) => {
    await page.goto(`/proposals/${UPDATE_SECTION}`);
    const rows = page.getByTestId("diff-row");
    await expect(rows.first()).toBeVisible();
    const text = (await page.getByTestId("proposal-detail").innerText()) ?? "";
    expect(text).not.toMatch(/[[\]{}"]/);
    const regions = rows.filter({ hasText: "Regions" });
    await expect(regions.getByTestId("diff-after")).toHaveText(
      "Test Valley, Test State",
    );
    await expect(regions.getByTestId("diff-note")).toHaveText("added");
    const country = rows.filter({ hasText: "Country" });
    await expect(country.getByTestId("diff-after")).toHaveText("AT");
    await expect(country.getByTestId("diff-note")).toHaveText("added");
  });

  test("the old value is struck through, then an arrow, then the new", async ({
    page,
  }) => {
    await page.goto(`/proposals/${UPDATE_SECTION}`);
    const name = page.getByTestId("diff-row").filter({ hasText: "Name" });
    await expect(name.getByTestId("diff-before")).toHaveText("Upper Test");
    expect(
      await computed(name.getByTestId("diff-before"), "text-decoration-line"),
    ).toBe("line-through");
    await expect(name.getByTestId("diff-after")).toHaveText("Upper Test Gorge");
    await expect(page.getByTestId("proposal-detail")).toContainText("→");
    for (const row of await page.getByTestId("diff-row").all()) {
      await expect(row).not.toContainText(" to ");
    }
  });

  test("the key column is 76px at 13px and plain", async ({ page }) => {
    await page.goto(`/proposals/${UPDATE_SECTION}`);
    const key = page.getByTestId("diff-key").first();
    await expect(key).toBeVisible();
    expect(await computed(key, "font-size")).toBe("13px");
    expect(await computed(key, "font-weight")).toBe("400");
    expect(Math.round((await key.boundingBox())?.width ?? 0)).toBe(76);
  });
});

test.describe("proposal create facts", () => {
  test("a feature create states its facts in words", async ({ page }) => {
    await page.goto(`/proposals/${FEATURE_CREATE}`);
    const facts = page.getByTestId("create-facts");
    await expect(facts).toContainText("Feature type");
    await expect(facts).toContainText("Rapid");
    await expect(facts).toContainText("Difficulty");
    await expect(facts).toContainText("III");
    await expect(facts).not.toContainText("metadata");
    const label = facts.getByTestId("fact-label").first();
    expect(await computed(label, "text-transform")).toBe("none");
    expect(
      Number.parseFloat(await computed(label, "font-size")),
    ).toBeGreaterThanOrEqual(12);
  });

  test("the description is said once", async ({ page }) => {
    await page.goto(`/proposals/${FEATURE_CREATE_DESCRIBED}`);
    const detail = page.getByTestId("proposal-detail");
    await expect(
      detail.getByText("Description", { exact: true }),
    ).toBeVisible();
    await expect(detail.getByText(DESCRIBED_TEXT)).toHaveCount(1);
  });

  test("a point feature shows no range and its features sit on a card", async ({
    page,
  }) => {
    await page.goto(`/proposals/${FEATURE_CREATE_DESCRIBED}`);
    const detail = page.getByTestId("proposal-detail");
    await expect(
      detail.locator(".MuiTypography-overline", { hasText: "Features" }),
    ).toBeVisible();
    await expect(detail).not.toContainText("0.0-0.0");
    await expect(detail).not.toContainText("Full section");
    const rows = detail.getByText("Point", { exact: true });
    await expect(rows.first()).toBeVisible();
    const cardShadow = await rows.first().evaluate((el) => {
      for (let n: Element | null = el; n; n = n.parentElement) {
        const s = getComputedStyle(n).boxShadow;
        if (s !== "none") return s;
      }
      return "none";
    });
    expect(cardShadow).not.toBe("none");
  });
});

test.describe("proposal votes and review bar", () => {
  test("the vote row is in view when the proposal opens", async ({ page }) => {
    await page.goto(`/proposals/${FEATURE_UPDATE}`);
    const up = page.getByRole("button", { name: "Upvote proposal" });
    await expect(up).toBeVisible();
    const bar = page.getByRole("button", { name: "Approve" });
    const [u, b, vp] = await Promise.all([
      up.boundingBox(),
      bar.boundingBox(),
      page.viewportSize(),
    ]);
    if (!u || !b || !vp) throw new Error("no boxes");
    expect(u.y + u.height).toBeLessThanOrEqual(b.y);
    expect(u.y).toBeGreaterThanOrEqual(0);
  });

  test("approve and reject are labelled 44px buttons in one row", async ({
    page,
  }) => {
    await page.goto(`/proposals/${FEATURE_CREATE}`);
    const reject = page.getByRole("button", { name: "Reject" });
    const approve = page.getByRole("button", { name: "Approve" });
    await expect(approve).toBeVisible();
    await expect(reject).toHaveText("Reject");
    await expect(approve).toHaveText("Approve");
    await expectTouchTargets(reject);
    await expectTouchTargets(approve);
    const [r, a] = await Promise.all([
      reject.boundingBox(),
      approve.boundingBox(),
    ]);
    if (!r || !a) throw new Error("no boxes");
    expect(Math.abs(r.y - a.y)).toBeLessThan(2);
    expect(r.x).toBeLessThan(a.x);
  });

  test("the review bar stays above the map controls @small", async ({
    page,
  }) => {
    await page.goto(`/proposals/${FEATURE_CREATE}`);
    const approve = page.getByRole("button", { name: "Approve" });
    await expect(approve).toBeVisible();
    await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
    const onTop = await approve.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(
        r.x + r.width / 2,
        r.y + r.height / 2,
      );
      return hit === el || el.contains(hit);
    });
    expect(onTop).toBe(true);
    await expectNoHorizontalOverflow(page);
  });

  test.describe("signed out", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("the votes say why they are off", async ({ page }) => {
      await page.goto(`/proposals/${FEATURE_CREATE}`);
      await expect(page.getByText("Sign in to vote")).toBeVisible();
    });
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

  test("the open card has a teal ring, the pane is a card without a status chip", async ({
    page,
    isMobile,
  }) => {
    test.skip(!!isMobile, "two panes start at md");
    await page.goto("/proposals?status=pending");
    await card(page, "Mittelschwall").click();
    const c = card(page, "Mittelschwall");
    expect(await computed(c, "background-color")).toBe("rgb(255, 255, 255)");
    expect(await computed(c, "box-shadow")).toContain("inset");
    expect(await computed(c, "box-shadow")).toContain("14, 116, 144");
    expect(await computed(c, "box-shadow")).toContain("0px 0px 0px 2px");
    const detail = page.getByTestId("proposal-detail");
    // The pane is a white card with radius 16 and room around it.
    const frame = detail.locator("xpath=..");
    expect(await computed(frame, "border-radius")).toBe("16px");
    expect(await computed(frame, "background-color")).toBe(
      "rgb(255, 255, 255)",
    );
    const [f, pane] = await Promise.all([
      frame.boundingBox(),
      page.getByTestId("proposal-pane").boundingBox(),
    ]);
    if (!f || !pane) throw new Error("no boxes");
    expect(Math.round(f.x - pane.x)).toBe(12);
    // The tab already says Pending.
    await expect(detail.getByTestId("proposal-status")).toHaveCount(0);
  });
});
