import { expect, type Page, test } from "@playwright/test";
import {
  expectNoHorizontalOverflow,
  expectTouchTargets,
} from "../support/fixture";
import { API } from "../support/signIn";

// Whether a model is still made: the label on discontinued rows, the fact and
// its source on the entry page, the "Still made" filter on the list and the
// tree, and the form. The seeded catalogue carries the research (a snapshot
// of 2026-11-01); the checks read their expectations from the API.

const rows = (page: Page) =>
  page.getByTestId("material-row").filter({ visible: true });

interface Entry {
  id: number;
  brand: string;
  model: string;
  availability: string;
  availability_source?: string;
  availability_checked?: string;
  year_to?: number;
}

async function entries(page: Page, query: string, perPage = 1) {
  const res = await page.request.get(
    `${API}/api/v1/materials?${query}&per_page=${perPage}`,
  );
  expect(res.status()).toBe(200);
  return (await res.json()) as { items: Entry[]; total: number };
}

async function models(page: Page, query: string) {
  const res = await page.request.get(
    `${API}/api/v1/materials/models?${query}&per_page=1`,
  );
  expect(res.status()).toBe(200);
  return (await res.json()) as { total: number };
}

test.describe("availability", () => {
  test("a discontinued model says so on its row, a current one says nothing @small", async ({
    page,
  }) => {
    const gone = (
      await entries(page, "availability=discontinued&brand=Pyranha")
    ).items[0];
    const made = (await entries(page, "availability=current&brand=Pyranha"))
      .items[0];
    const open = async (e: Entry) => {
      await page.goto(
        `/materials?q=${encodeURIComponent(`${e.brand} ${e.model}`)}`,
      );
      await expect(rows(page).first()).toBeVisible();
      return rows(page)
        .filter({ hasText: `${e.brand} ${e.model}` })
        .first();
    };
    const discontinued = await open(gone);
    await expect(discontinued.getByTestId("availability-label")).toHaveText(
      "Discontinued",
    );
    await expectNoHorizontalOverflow(page);
    const current = await open(made);
    await expect(current.getByTestId("availability-label")).toHaveCount(0);
    await expect(current).not.toContainText("Discontinued");
    await expect(current).not.toContainText("unknown");
  });

  test("the entry page states it with the day and a link to the source @small", async ({
    page,
  }) => {
    const gone = (await entries(page, "availability=discontinued")).items[0];
    await page.goto(`/materials/${gone.id}`);
    const fact = page
      .getByTestId("fact-label")
      .filter({ hasText: "Availability" })
      .locator("..");
    await expect(fact).toContainText(
      gone.year_to
        ? `Discontinued (last model year ${gone.year_to})`
        : "Discontinued",
    );
    await expect(fact).toContainText("Checked 01 Nov 2026");
    const link = fact.getByRole("link");
    await expect(link).toHaveAttribute("href", gone.availability_source ?? "");
    await expect(link).toHaveAttribute("target", "_blank");
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(link);

    const made = (await entries(page, "availability=current")).items[0];
    await page.goto(`/materials/${made.id}`);
    await expect(
      page
        .getByTestId("fact-label")
        .filter({ hasText: "Availability" })
        .locator(".."),
    ).toContainText("Still made");
  });

  test("Still made narrows the list and the tree, and sits in the URL", async ({
    page,
  }, info) => {
    const all = await models(page, "category=kayak");
    const current = await models(page, "category=kayak&availability=current");
    expect(current.total).toBeGreaterThan(0);
    expect(current.total).toBeLessThan(all.total);

    await page.goto("/materials?category=kayak");
    await expect(rows(page).first()).toBeVisible();
    await expect(page.getByText(`${all.total} models`)).toBeVisible();

    if (info.project.name.startsWith("phone")) {
      await page.getByTestId("filters-chip").click();
    }
    await page.getByRole("button", { name: "Still made" }).click();
    await expect(page).toHaveURL(/availability=current/);
    if (info.project.name.startsWith("phone")) {
      await expect(page.getByText(`${current.total} results`)).toBeVisible();
      await page.keyboard.press("Escape");
    }
    await expect(page.getByText(`${current.total} models`)).toBeVisible();

    const treeRes = await page.request.get(
      `${API}/api/v1/materials/tree?availability=current`,
    );
    const tree = (await treeRes.json()) as {
      categories: { category: string; models: number }[];
    };
    const kayaks = tree.categories.find((c) => c.category === "kayak");
    expect(kayaks?.models).toBe(current.total);
    if (!info.project.name.startsWith("phone")) {
      await expect(
        page.getByRole("treeitem", { name: /^Kayaks/ }),
      ).toContainText(String(current.total));
      await expect(
        page.getByRole("button", { name: "Remove availability filter" }),
      ).toBeVisible();
    }
  });

  test("a link with the filter opens it set", async ({ page }) => {
    await page.goto("/materials?category=kayak&availability=current");
    await expect(rows(page).first()).toBeVisible();
    await expect(
      page.locator('[data-testid="availability-label"]'),
    ).toHaveCount(0);
  });

  test("the form saves availability, its source and day @write", async ({
    page,
  }) => {
    await page.goto("/materials/new");
    await page.getByLabel("Brand").fill("Specprobe");
    await page.getByLabel("Model").fill("Gone");
    await page.getByLabel("Last year").fill("2008");
    await page.getByLabel("Availability", { exact: true }).click();
    // The menu opens on the current choice (unknown); one step up is
    // Discontinued. The keyboard avoids clicking an option that is still
    // moving into place.
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("combobox", { name: "Availability" }),
    ).toHaveText("Discontinued");
    await page
      .getByLabel("Availability source")
      .fill("https://example.com/archive");
    await page.getByLabel("Checked on").fill("2026-10-30");
    await page.getByRole("button", { name: "Save entry" }).click();

    const fact = page
      .getByTestId("fact-label")
      .filter({ hasText: "Availability" })
      .locator("..");
    await expect(fact).toContainText("Discontinued (last model year 2008)");
    await expect(fact).toContainText("Checked 30 Oct 2026");
    await expect(fact.getByRole("link")).toHaveAttribute(
      "href",
      "https://example.com/archive",
    );

    await page.getByRole("button", { name: "Entry actions" }).click();
    await page.getByRole("menuitem", { name: "Edit entry" }).click();
    await expect(page.getByLabel("Availability source")).toHaveValue(
      "https://example.com/archive",
    );
    await page.getByLabel("Availability source").fill("javascript:alert(1)");
    await page.getByRole("button", { name: "Save entry" }).click();
    await expect(page.getByRole("alert")).toContainText("http");
    await page.getByRole("button", { name: "Cancel" }).click();

    await page.getByRole("button", { name: "Entry actions" }).click();
    await page.getByRole("menuitem", { name: "Delete entry" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page).toHaveURL(/\/materials(\?|$)/);
  });
});
