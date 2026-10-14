import { expect, type Page, test } from "@playwright/test";
import { appReady } from "../support/fixture";

// The map draws what the search list shows: sections the filters leave out are
// not drawn. Fixture: 9104 is grade II at low water, 9105 is grade IV-V at
// high water; both belong to Test River.

type SourceLike = { serialize(): { data: { features: { id: number }[] } } };
type MapLike = { getSource(id: string): SourceLike | undefined };

async function drawn(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const map = (window as unknown as { __paddlemateMap?: MapLike })
      .__paddlemateMap;
    const data = map?.getSource("sections")?.serialize().data;
    return (data?.features ?? []).map((f) => Number(f.id));
  });
}

async function open(page: Page, query: string) {
  await page.goto(`/?q=Test${query}`);
  await appReady(page);
}

test.describe("the map follows the filters", () => {
  test("sections outside the grade range are not drawn", async ({ page }) => {
    await open(page, "&min_diff=3&max_diff=4");
    await expect.poll(() => drawn(page)).toContain(9102);
    expect(await drawn(page)).not.toContain(9104);
  });

  test("Water now keeps only the sections at that level", async ({ page }) => {
    await open(page, "&water=high");
    await expect.poll(() => drawn(page)).toContain(9105);
    expect(await drawn(page)).not.toContain(9104);
    expect(await drawn(page)).not.toContain(9102);
  });

  test("clearing the filters draws everything again", async ({ page }) => {
    await open(page, "&water=high");
    await expect.poll(() => drawn(page)).not.toContain(9104);
    await page.goto("/?q=Test");
    await appReady(page);
    await expect.poll(() => drawn(page)).toContain(9104);
    expect(await drawn(page)).toContain(9105);
  });

  test("the open section is drawn whatever the filters say", async ({
    page,
  }) => {
    await page.goto("/?q=Test&water=high&waterway=9001&section=9104");
    await appReady(page);
    await expect.poll(() => drawn(page)).toContain(9104);
  });
});
