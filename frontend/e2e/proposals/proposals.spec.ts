import { expect, type Page, test } from "@playwright/test";
import {
  computed,
  expectNoHorizontalOverflow,
  expectTouchTargets,
  gotoSection,
} from "../support/fixture";

// WP11: proposals list, detail and review. Fixture proposals 9701 to 9707 are
// pending; a review is never sent for real, the PATCH is fulfilled here.

const FEATURE_CREATE = 9701;
const FEATURE_UPDATE = 9706;
const FEATURE_CREATE_DESCRIBED = 9702;
const DESCRIBED_TEXT = "Sticky";
const UPDATE_SECTION = 9705;

/** The proposals list answers one page of this shape. */
const paged = (items: unknown[]) => ({
  items,
  page: 1,
  per_page: 100,
  total: items.length,
  total_pages: 1,
});

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
    await expect(c).toContainText("New feature");
    await expect(c.getByTestId("proposal-meta")).toContainText(/ago|now/);
    // The tab already says Pending.
    await expect(page.getByTestId("proposal-status")).toHaveCount(0);
  });

  test("kind and votes sit in a right column at 13px", async ({ page }) => {
    await page.route("**/api/v1/proposals?*", (r) =>
      r.fulfill({
        json: paged([
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
        ]),
      }),
    );
    await page.goto("/proposals?status=pending");
    // The swipe neighbour on a phone holds the same mocked row.
    const c = card(page, "Somewhere").first();
    const kind = c.getByText("New river");
    const meta = c.getByTestId("proposal-meta");
    await expect(meta.locator("svg")).toHaveCount(2);
    await expect(meta).toContainText(/1\s+0\s+·/);
    expect(await computed(kind, "font-size")).toBe("13px");
    expect(await computed(kind, "font-weight")).toBe("400");
    expect(await computed(meta, "font-weight")).toBe("500");
    const title = await c.getByText("Somewhere").boundingBox();
    const kindBox = await kind.boundingBox();
    expect(kindBox?.x ?? 0).toBeGreaterThan(
      (title?.x ?? 0) + (title?.width ?? 0) - 1,
    );
  });

  test("the list names its count in proposals", async ({ page }) => {
    await page.goto("/proposals?status=pending");
    await expect(card(page, "Mittelschwall")).toBeVisible();
    await expect(
      page.getByText(/^\d+ proposals?$/).filter({ visible: true }),
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

  test("cards are 16px padded, 8px apart", async ({ page }, info) => {
    test.skip(info.project.name === "desktop", "desktop rows are flat");
    await page.goto("/proposals?status=pending");
    const cards = page.getByTestId("proposal-card").filter({ visible: true });
    await expect(cards.first()).toBeVisible();
    expect(await computed(cards.first(), "padding-left")).toBe("16px");
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
    // The route is opened from the Pending tab, so the chip would repeat it.
    await expect(page.getByTestId("proposal-status")).toHaveCount(0);
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
    await expect(regions.getByTestId("diff-note")).toHaveText("none");
    const country = rows.filter({ hasText: "Country" });
    await expect(country.getByTestId("diff-after")).toHaveText("Austria");
    await expect(country.getByTestId("diff-note")).toHaveText("none");
  });

  test("the old value is struck through under Before, the new under After", async ({
    page,
  }) => {
    await page.goto(`/proposals/${UPDATE_SECTION}`);
    const name = page.getByTestId("diff-row").filter({ hasText: "Name" });
    await expect(name.getByTestId("diff-before")).toHaveText("Upper Test");
    expect(
      await computed(name.getByTestId("diff-before"), "text-decoration-line"),
    ).toBe("line-through");
    await expect(name.getByTestId("diff-after")).toHaveText("Upper Test Gorge");
    const table = page.getByTestId("diff-table");
    await expect(table).toContainText("Before");
    await expect(table).toContainText("After");
    await expect(table).not.toContainText("→");
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
      detail.getByRole("heading", { name: "Features", exact: true }),
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

  test("the review bar is docked at the foot of a short proposal", async ({
    page,
  }, info) => {
    test.skip(info.project.name === "desktop", "the phone page");
    await page.goto(`/proposals/${FEATURE_UPDATE}`);
    const approve = page.getByRole("button", { name: "Approve" });
    await expect(approve).toBeVisible();
    const [b, vp] = await Promise.all([
      approve.boundingBox(),
      page.viewportSize(),
    ]);
    if (!b || !vp) throw new Error("no boxes");
    // Above the 64px bottom nav, not floating right under the content.
    expect(b.y + b.height).toBeGreaterThan(vp.height - 64 - 80);
    const card = page.getByTestId("proposal-detail").locator("> div").nth(1);
    expect(await computed(card, "background-color")).toBe("rgb(255, 255, 255)");
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
    // The main action comes first.
    expect(a.x).toBeLessThan(r.x);
  });

  test("the review bar stays above the map controls @small", async ({
    page,
  }) => {
    await page.goto(`/proposals/${FEATURE_CREATE}`);
    const approve = page.getByRole("button", { name: "Approve" });
    await expect(approve).toBeVisible();
    await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
    // The map's Labels control must not be painted over the bar: at the
    // bar's top edge the bar is what a finger hits, wherever the control is.
    const overlap = await approve.evaluate((btn) => {
      const bar = btn.parentElement as HTMLElement;
      const control = document.querySelector(
        '[data-testid="map-layer-toggle"]',
      );
      const b = bar.getBoundingClientRect();
      const c = control?.getBoundingClientRect() ?? b;
      const x0 = Math.max(b.left, c.left);
      const x1 = Math.min(b.right, c.right);
      const y0 = Math.max(b.top, c.top);
      const y1 = Math.min(b.bottom, c.bottom);
      if (!control || x1 <= x0 || y1 <= y0)
        return { overlaps: false, barOnTop: true };
      const hit = document.elementFromPoint((x0 + x1) / 2, (y0 + y1) / 2);
      return { overlaps: true, barOnTop: !!hit && bar.contains(hit) };
    });
    expect(overlap.barOnTop, "bar paints over the Labels control").toBe(true);
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

type MapLike = {
  isMoving(): boolean;
  loaded(): boolean;
  project(lngLat: [number, number]): { x: number; y: number };
  getPaintProperty(layer: string, name: string): unknown;
  querySourceFeatures(source: string): unknown[];
};

const mapOf = (page: Page) =>
  page.waitForFunction(() => {
    const map = (window as unknown as { __paddlemateMap?: MapLike })
      .__paddlemateMap;
    return !!map && map.loaded() && !map.isMoving();
  });

const listCard = (page: Page) => page.getByTestId("canvas-card-list");
const sideCard = (page: Page) => page.getByTestId("canvas-card-proposal");

// WP16e: from md the list and the open proposal float over the shared map.
test.describe("canvas", () => {
  test.skip(({ isMobile }) => isMobile, "cards start at md");
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the list is a 300px card over the one map", async ({ page }) => {
    await page.goto("/proposals?status=pending");
    await expect(card(page, "Mittelschwall")).toBeVisible();
    expect(Math.round((await listCard(page).boundingBox())?.width ?? 0)).toBe(
      300,
    );
    // Nothing open: the side card only asks for a choice.
    await expect(sideCard(page)).toContainText("Select a proposal");
    await expect(page.locator(".maplibregl-map")).toHaveCount(1);
  });

  test("a selected proposal opens in a 25% side card beside the list", async ({
    page,
  }) => {
    await page.goto("/proposals?status=pending");
    await card(page, "Mittelschwall").click();
    await expect(page).toHaveURL(/selected=9701/);
    const side = sideCard(page);
    await expect(side).toContainText("Mittelschwall");
    await expect(side.getByTestId("proposal-detail")).toBeVisible();
    expect(Math.round((await side.boundingBox())?.width ?? 0)).toBe(400);
    // The card draws the title; the pane inside has no header of its own and
    // no map of its own.
    await expect(side.getByRole("button", { name: "Back" })).toHaveCount(0);
    await expect(page.locator(".maplibregl-map")).toHaveCount(1);
    await expect(listCard(page)).not.toHaveAttribute("data-collapsed");
    // The list marks the open row with the teal bar.
    expect(await computed(card(page, "Mittelschwall"), "box-shadow")).toContain(
      "14, 116, 144",
    );
  });

  test("closing the card clears the selection", async ({ page }) => {
    await page.goto("/proposals?status=pending&selected=9701");
    await expect(sideCard(page)).toBeVisible();
    await sideCard(page).getByRole("button", { name: "Close" }).click();
    // Nothing open: the side card only asks for a choice.
    await expect(sideCard(page)).toContainText("Select a proposal");
    await expect(page).not.toHaveURL(/selected=/);
  });

  test("a deep link opens the proposal with the list beside it", async ({
    page,
  }) => {
    await page.goto(`/proposals/${FEATURE_UPDATE}`);
    await expect(sideCard(page)).toBeVisible();
    await expect(sideCard(page).getByTestId("diff-row").first()).toBeVisible();
    await expect(listCard(page)).toBeVisible();
    await expect(page.locator(".maplibregl-map")).toHaveCount(1);
    await expect(page).toHaveURL(new RegExp(`/proposals/${FEATURE_UPDATE}$`));
  });

  test("the review controls sit at the card's foot", async ({ page }) => {
    await page.goto(`/proposals/${FEATURE_CREATE}`);
    const approve = sideCard(page).getByRole("button", { name: "Approve" });
    await expect(approve).toBeVisible();
    const [c, b] = await Promise.all([
      sideCard(page).boundingBox(),
      approve.boundingBox(),
    ]);
    if (!c || !b) throw new Error("no boxes");
    // 16px of bar padding below the button, however short the proposal.
    expect(c.y + c.height - (b.y + b.height)).toBeLessThanOrEqual(20);
  });

  test("a section update draws the old line and the new one in teal", async ({
    page,
  }) => {
    await page.goto(`/proposals/${UPDATE_SECTION}`);
    await expect(sideCard(page)).toBeVisible();
    await mapOf(page);
    const drawn = await page.evaluate(() => {
      const map = (window as unknown as { __paddlemateMap: MapLike })
        .__paddlemateMap;
      return {
        stored: map.querySourceFeatures("sections").length,
        proposed: map.querySourceFeatures("section-preview").length,
        teal: map.getPaintProperty("section-preview-line", "line-color"),
      };
    });
    expect(drawn.stored).toBeGreaterThan(0);
    expect(drawn.proposed).toBeGreaterThan(0);
    expect(drawn.teal).toBe("#0e7490");
  });

  test("the proposed line lies inside the free map area", async ({ page }) => {
    await page.goto(`/proposals/${UPDATE_SECTION}`);
    await expect(sideCard(page)).toBeVisible();
    await expect
      .poll(
        async () => {
          const raw = await page
            .getByTestId("canvas-host")
            .getAttribute("data-free");
          const [x, y, w, h] = (raw ?? "").split(",").map(Number);
          const pts = await page.evaluate(() => {
            const map = (window as unknown as { __paddlemateMap?: MapLike })
              .__paddlemateMap;
            if (!map || map.isMoving()) return null;
            return {
              sw: map.project([11.0, 47.0]),
              ne: map.project([11.008, 47.012]),
            };
          });
          if (!pts) return "moving";
          const slack = 2;
          return pts.sw.x >= x - slack &&
            pts.ne.x <= x + w + slack &&
            pts.ne.y >= y - slack &&
            pts.sw.y <= y + h + slack
            ? "inside"
            : JSON.stringify({ x, y, w, h, ...pts });
        },
        { timeout: 8000 },
      )
      .toBe("inside");
  });

  test("a proposal that does not exist says so", async ({ page }) => {
    await page.goto("/proposals/999999");
    await expect(sideCard(page)).toContainText("Proposal not found.");
  });
});

test.describe("phone keeps its pages", () => {
  test("a proposal is a page with its own map and no canvas card", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "phone only");
    await page.goto(`/proposals/${FEATURE_CREATE}`);
    await expect(page.getByTestId("proposal-detail")).toBeVisible();
    // A phone keeps its own page: no floating canvas card.
    await expect(sideCard(page)).toHaveCount(0);
    await expect(
      page.getByTestId("proposal-detail").getByRole("button", {
        name: "Back",
      }),
    ).toBeVisible();
  });
});

test.describe("proposals on desktop", () => {
  test("rows are flat with a rule, and the right side says what to do", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "desktop", "desktop layout");
    await page.goto("/proposals?status=pending");
    const first = page.getByTestId("proposal-card").filter({ visible: true });
    await expect(first.first()).toBeVisible();
    expect(await computed(first.first(), "box-shadow")).toBe("none");
    expect(await computed(first.first(), "border-bottom-width")).toBe("1px");
    await expect(
      page.getByText("Select a proposal to review it."),
    ).toBeVisible();
    await first.first().click();
    expect(await computed(first.first(), "box-shadow")).toContain(
      "3px 0px 0px 0px",
    );
  });
});

test.describe("proposal load failures", () => {
  const body = {
    error: { code: "internal", message: "Boom from server", target: null },
  };

  test("a failed list shows the server message, not the empty state", async ({
    page,
  }) => {
    await page.route("**/api/v1/proposals?*", (r) =>
      r.fulfill({ status: 500, json: body }),
    );
    await page.goto("/proposals?status=pending");
    await expect(page.getByTestId("error-state").first()).toContainText(
      "Boom from server",
    );
    await expect(page.getByText(/No pending proposals/)).toHaveCount(0);
    await expect(page.getByText(/\d+ proposals?/)).toHaveCount(0);
  });

  test("a failed detail keeps its header and does not say not found", async ({
    page,
  }, info) => {
    test.skip(info.project.name === "desktop", "the phone overlay");
    await page.route(`**/api/v1/proposals/${FEATURE_UPDATE}`, (r) =>
      r.fulfill({ status: 500, json: body }),
    );
    await page.goto(`/proposals/${FEATURE_UPDATE}`);
    await expect(page.getByTestId("error-state")).toContainText(
      "Boom from server",
    );
    await expect(page.getByRole("button", { name: /back/i })).toBeVisible();
    await expect(page.getByText("Proposal not found.")).toHaveCount(0);
  });
});

/** The signed-in user's id, read from the bearer token of an API call. */
async function myId(page: Page): Promise<string> {
  const request = await page.waitForRequest(
    (r) => r.url().includes("/api/v1/") && !!r.headers().authorization,
  );
  const token = request.headers().authorization.split(" ")[1];
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())
    .sub;
}

function ownProposal(id: string, submittedBy: string) {
  const now = new Date().toISOString();
  return {
    id: 777,
    status: "pending",
    entity_type: "feature",
    entity_id: 9524,
    operation: "update",
    original_data: { id: 9524, feature_type: "rapid", metadata: {} },
    proposed_data: { name: "Big Hole", feature_type: "rapid", metadata: {} },
    submitted_by: submittedBy,
    created_at: now,
    updated_at: now,
    upvotes: 0,
    downvotes: 0,
    user_vote: null,
    note: id,
  };
}

test.describe("your own proposal", () => {
  async function open(page: Page) {
    const idPromise = myId(page);
    await page.goto("/proposals?status=pending");
    const mine = ownProposal("own", await idPromise);
    let withdrawn = false;
    await page.route("**/api/v1/proposals/777", (r) => {
      if (r.request().method() === "DELETE") {
        withdrawn = true;
        return r.fulfill({ status: 204 });
      }
      return r.fulfill({ json: mine });
    });
    await page.goto("/proposals/777");
    return { isWithdrawn: () => withdrawn };
  }

  test("the author can withdraw it after a confirmation", async ({ page }) => {
    const sent = await open(page);
    await page
      .getByRole("button", { name: "Proposal actions" })
      .filter({ visible: true })
      .click();
    await page.getByRole("menuitem", { name: "Withdraw" }).click();
    await expect(page.getByRole("dialog")).toContainText("Withdraw");
    expect(sent.isWithdrawn()).toBe(false);
    await page.getByRole("button", { name: "Withdraw", exact: true }).click();
    await expect.poll(() => sent.isWithdrawn()).toBe(true);
  });

  test("the author cannot vote for it", async ({ page }) => {
    await open(page);
    await expect(
      page.getByRole("button", { name: "Upvote proposal" }).filter({
        visible: true,
      }),
    ).toBeDisabled();
  });

  test("someone else's proposal has no withdraw", async ({ page }) => {
    await page.route("**/api/v1/proposals/777", (r) =>
      r.fulfill({ json: ownProposal("other", "someone-else") }),
    );
    await page.goto("/proposals/777");
    await expect(page.getByTestId("proposal-detail")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Proposal actions" }),
    ).toHaveCount(0);
    await expect(
      page
        .getByRole("button", { name: "Upvote proposal" })
        .filter({ visible: true }),
    ).toBeEnabled();
  });
});

test.describe("a proposal in a feature row", () => {
  async function openRow(page: Page, submittedBy: (me: string) => string) {
    const idPromise = myId(page);
    await page.goto("/?waterway=9001&section=9102");
    const me = await idPromise;
    const mine = {
      ...ownProposal("row", submittedBy(me)),
      entity_id: null,
      operation: "create",
      original_data: null,
      proposed_data: {
        name: "Row Vote Rapid",
        location: { type: "Point", coordinates: [11.0132, 47.0132] },
        metadata: {},
        lang_code: "en",
        section_id: 9102,
        waterway_id: 9001,
        feature_type: "rapid",
      },
    };
    await page.route("**/api/v1/proposals?*", (r) =>
      r.fulfill({
        json: {
          items: [mine],
          total: 1,
          page: 1,
          per_page: 100,
          total_pages: 1,
        },
      }),
    );
    await page.goto("/?waterway=9001&section=9102");
    await page
      .getByRole("button", { name: "Section actions" })
      .filter({ visible: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Show proposed features" })
      .click();
    await page
      .locator("[data-row]")
      .filter({ hasText: "Row Vote Rapid" })
      .filter({ visible: true })
      .first()
      .click();
    return page
      .getByRole("button", { name: "Upvote proposal", exact: true })
      .filter({ visible: true });
  }

  test("the author cannot vote on it", async ({ page }) => {
    await expect(await openRow(page, (me) => me)).toBeDisabled();
  });

  test("someone else can", async ({ page }) => {
    await expect(await openRow(page, () => "someone-else")).toBeEnabled();
  });
});

test.describe("proposal diff of an unchanged field", () => {
  test("a name the proposal repeats is no change, one the snapshot lacks is not recorded", async ({
    page,
  }) => {
    const now = new Date().toISOString();
    await page.route("**/api/v1/proposals/778", (r) =>
      r.fulfill({
        json: {
          ...ownProposal("diff", "someone-else"),
          id: 778,
          entity_type: "water_section",
          original_data: {
            id: 1,
            name: "Lower Test",
            description: null,
            country: "AT",
            regions: ["Test Valley"],
          },
          proposed_data: { name: "Lower Test", description: "Steady." },
          created_at: now,
        },
      }),
    );
    await page.goto("/proposals/778");
    const rows = page.getByTestId("diff-row");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Description");
    await expect(page.getByTestId("proposal-detail")).not.toContainText(
      "Country",
    );
  });
});

test.describe("sending a proposal", () => {
  test("a non-admin's write says it went to review", async ({ page }) => {
    await page.route("**/api/v1/waterways/*/sections/*/features/*", (r) => {
      if (r.request().method() !== "PUT") return r.fallback();
      return r.fulfill({
        status: 202,
        json: ownProposal("sent", "someone-else"),
      });
    });
    await gotoSection(page, "lower");
    const card = page.getByTestId("features-card").filter({ visible: true });
    await card.locator("[data-row]").filter({ hasText: "Altes Wehr" }).click();
    await card
      .getByRole("button", { name: "Feature actions", exact: true })
      .first()
      .click();
    await page.getByRole("menuitem", { name: /Edit feature/ }).click();
    await page.getByRole("button", { name: "Submit" }).click();
    const notice = page.getByTestId("proposal-sent");
    await expect(notice).toContainText("Sent for review");
    await expect(notice.getByRole("button", { name: "View" })).toBeVisible();
  });
});
