import { expect, type Page, test } from "@playwright/test";
import { API } from "../support/signIn";

// The wiki's filters and sorts against the seeded catalogue: the newest
// model, counts that agree between the tree and the list, and paging that
// neither repeats nor skips a model. Read-only.

const rows = (page: Page) =>
  page.getByTestId("material-row").filter({ visible: true });

interface Model {
  brand: string;
  model: string;
  variant?: string;
  category: string;
}
interface TreeNode {
  category?: string;
  discipline?: string;
  models: number;
  disciplines?: TreeNode[];
}

const keyOf = (m: Model) =>
  `${m.category}|${m.brand}|${m.model}|${m.variant ?? ""}`;

async function modelPage(
  page: Page,
  query: string,
  pageNo: number,
  perPage: number,
) {
  const res = await page.request.get(
    `${API}/api/v1/materials/models?${query}&page=${pageNo}&per_page=${perPage}`,
  );
  expect(res.status()).toBe(200);
  return (await res.json()) as { items: Model[]; total: number };
}

test.describe("wiki filters", () => {
  test("the newest plastic kayak is the newest model, not the last one added", async ({
    page,
  }) => {
    await page.goto(
      "/materials?category=kayak&construction=plastic&sort=newest",
    );
    // Models of the latest year, by name; the Storm was re-released in 2026.
    const expected = [
      "DragoRossi Naga",
      "Lettmann The Dude 75",
      "Prijon Drip",
      "Pyranha Storm",
      "Waka Kayaks Manu",
    ];
    await expect(rows(page).nth(4)).toBeVisible();
    for (const [i, name] of expected.entries()) {
      await expect(rows(page).nth(i)).toContainText(name);
    }
  });

  test("the sort field sends the sort and recently added is its own choice", async ({
    page,
  }, info) => {
    test.skip(
      info.project.name.startsWith("phone"),
      "the sort sits in the sheet",
    );
    await page.goto("/materials?category=kayak");
    await page.getByLabel("Sort by").click();
    const options = await page.getByRole("option").allTextContents();
    expect(options).toEqual([
      "Name",
      "Newest model",
      "Recently added",
      "Shortest first",
      "Smallest volume",
      "Lightest first",
    ]);
    await page.getByRole("option", { name: "Newest model" }).click();
    await expect(page).toHaveURL(/sort=newest/);
  });

  test("a combined filter count equals the tree count", async ({
    page,
  }, info) => {
    test.skip(
      info.project.name.startsWith("phone"),
      "the counts line is desktop",
    );
    const filters = "construction=plastic&fits_paddler_kg=80";
    const res = await page.request.get(
      `${API}/api/v1/materials/tree?${filters}`,
    );
    const tree = (await res.json()) as { categories: TreeNode[] };
    const kayak = tree.categories.find((c) => c.category === "kayak");
    const creek = kayak?.disciplines?.find((d) => d.discipline === "creek");
    expect(creek?.models).toBeGreaterThan(0);

    const list = await modelPage(
      page,
      `category=kayak&discipline=creek&${filters}`,
      1,
      1,
    );
    expect(list.total).toBe(creek?.models);

    await page.goto(
      "/materials?category=kayak&discipline=creek&construction=plastic&fits=80",
    );
    await expect(page.getByTestId("wiki-counts")).toContainText(
      `${creek?.models} models`,
    );
  });

  test("paging repeats and skips no model under any sort", async ({ page }) => {
    for (const sort of [
      "name",
      "newest",
      "added",
      "length",
      "volume",
      "weight",
    ]) {
      const query = `category=kayak&sort=${sort}`;
      const first = await modelPage(page, query, 1, 20);
      const seen: string[] = first.items.map(keyOf);
      for (let n = 2; n <= Math.ceil(first.total / 20); n++) {
        seen.push(...(await modelPage(page, query, n, 20)).items.map(keyOf));
      }
      expect(seen, sort).toHaveLength(first.total);
      expect(new Set(seen).size, `${sort} repeats a model`).toBe(first.total);
    }
  });

  test("showing more rows adds new models and a new filter starts over", async ({
    page,
  }) => {
    await page.goto("/materials?category=kayak&sort=newest");
    await expect(rows(page).first()).toBeVisible();
    const more = page.getByRole("button", { name: "Show more" });
    await more.click();
    await expect(rows(page).nth(24)).toBeVisible();
    const titles = await rows(page)
      .locator("h3, [data-testid=material-title]")
      .allTextContents();
    if (titles.length > 0) expect(new Set(titles).size).toBe(titles.length);

    await page.goto("/materials?category=kayak&sort=newest&construction=wood");
    const wood = await modelPage(
      page,
      "category=kayak&construction=wood",
      1,
      1,
    );
    await expect(rows(page)).toHaveCount(Math.min(wood.total, 24));
  });
});
