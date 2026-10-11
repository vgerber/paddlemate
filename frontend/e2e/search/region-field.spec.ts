import { expect, test } from "@playwright/test";
import { mockRegions, REGIONS } from "../map/regions.mock";
import { appReady } from "../support/fixture";

// The floating "Search regions..." field of the phone's region picker: typing
// lists the matching regions and picking one selects it.

test.describe("region search field", () => {
  test("typing lists the matching regions and a pick selects it", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "the field belongs to the phone's region sheet");
    await mockRegions(page);
    await page.route(/\/api\/v1\/geo\/regions\?q=/, (route) => {
      const q = new URL(route.request().url()).searchParams.get("q") ?? "";
      const hits = Object.values(REGIONS).filter((r) =>
        r.name.toLowerCase().includes(q.toLowerCase()),
      );
      return route.fulfill({ json: hits });
    });
    await page.goto("/?mode=region");
    await appReady(page);
    const field = page.getByRole("textbox", { name: "Search regions" });
    await field.fill("range");
    const alpha = page.getByRole("button", { name: /Alpha range/ });
    await expect(alpha).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Beta range/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Inner district/ }),
    ).toHaveCount(0);
    await alpha.click();
    await expect(page).toHaveURL(new RegExp(`region=${REGIONS.alpha.id}`));
    await expect(field).toHaveCount(0);
  });
});
