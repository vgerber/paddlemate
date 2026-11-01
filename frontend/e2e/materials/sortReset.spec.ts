import { expect, type Locator, type Page, test } from "@playwright/test";

// Sort and Reset live in the Filters area: the sidebar on a desktop, the
// sheet on a phone. The list's header has no sort. Read-only.

const SORTS = [
  "Name",
  "Newest model",
  "Recently added",
  "Shortest first",
  "Smallest volume",
  "Lightest first",
];

const isPhone = () => test.info().project.name.startsWith("phone");
const isDesktop = () => test.info().project.name.startsWith("desktop");

/** The area that holds the filters: the sidebar or the open sheet. */
async function filtersArea(page: Page): Promise<Locator> {
  if (isDesktop()) return page.getByRole("complementary");
  await page.getByTestId("filters-chip").click();
  const sheet = page.getByRole("dialog", { name: "Filters" });
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe("wiki sort and reset", () => {
  test("sort is chips in the filters area and sends the sort", async ({
    page,
  }) => {
    test.skip(!isPhone() && !isDesktop(), "phone and desktop only");
    await page.goto("/materials?category=kayak");
    const area = await filtersArea(page);
    const chips = area.getByRole("button", {
      name: new RegExp(`^(${SORTS.join("|")})$`),
    });
    await expect(chips).toHaveCount(SORTS.length);
    expect(await chips.allTextContents()).toEqual(SORTS);
    await area.getByRole("button", { name: "Newest model" }).click();
    await expect(page).toHaveURL(/sort=newest/);
  });

  test("the desktop header has no sort", async ({ page }) => {
    test.skip(!isDesktop(), "the header is a desktop card");
    await page.goto("/materials?category=kayak");
    await expect(page.getByTestId("wiki-header")).toBeVisible();
    await expect(
      page.getByTestId("wiki-header").getByLabel("Sort by"),
    ).toHaveCount(0);
    await expect(page.getByTestId("wiki-header")).not.toContainText("Sort by");
  });

  test("reset clears the sort and the filters, not the path", async ({
    page,
  }) => {
    test.skip(!isPhone() && !isDesktop(), "phone and desktop only");
    await page.goto(
      "/materials?category=kayak&construction=plastic&sort=newest",
    );
    const area = await filtersArea(page);
    const reset = area.getByRole("button", { name: "Reset" });
    await expect(reset).toBeEnabled();
    await reset.click();
    await expect(page).not.toHaveURL(/sort=|construction=/);
    await expect(page).toHaveURL(/category=kayak/);
    await expect(reset).toBeDisabled();
  });

  test("the chip row scrolls instead of widening the page at 130% text @small", async ({
    page,
  }) => {
    test.skip(isDesktop(), "the chip row is the phone's");
    await page.goto(
      "/materials?category=kayak&discipline=creek&brand=Pyranha&construction=plastic",
    );
    await page.addStyleTag({ content: "html{font-size:130% !important}" });
    const row = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(row.getByTestId("filters-chip")).toBeVisible();
    const over = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(over).toBe(0);
    const scrolls = await row
      .locator("> div")
      .evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(scrolls).toBe(true);
  });

  test("Browse and Filters sheets share their side insets", async ({
    page,
  }) => {
    test.skip(isDesktop(), "sheets are the phone's");
    await page.goto("/materials");
    await page.getByTestId("filters-chip").click();
    const heading = page.getByRole("heading", { name: "Filters", level: 2 });
    await expect(heading).toBeVisible();
    const filtersLeft = (await heading.boundingBox())?.x;
    await page.keyboard.press("Escape");
    await expect(heading).toBeHidden();

    await page.getByTestId("browse-button").click();
    const row = page.getByTestId("browse-all");
    await expect(row).toBeVisible();
    const text = await row.locator("span").first().boundingBox();
    const rowBox = await row.boundingBox();
    const chevron = await page
      .getByTestId("browse-row")
      .first()
      .locator("svg")
      .boundingBox();
    expect(text?.x).toBe(filtersLeft);
    expect(rowBox).not.toBeNull();
    expect((chevron?.x ?? 0) + (chevron?.width ?? 0)).toBe(
      (rowBox?.width ?? 0) - (filtersLeft ?? 0),
    );
  });
});
