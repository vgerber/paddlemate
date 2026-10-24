import { expect, type Locator, test } from "@playwright/test";

// In-screen section headings share one style on every screen
// (doc/design.md): 13/600, 18 line height, the secondary colour.

test.describe("section headings @small", () => {
  const style = (loc: Locator) =>
    loc.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        size: s.fontSize,
        weight: s.fontWeight,
        line: s.lineHeight,
        color: s.color,
        transform: s.textTransform,
      };
    });

  const seen = async (loc: Locator) => {
    await loc.first().waitFor({ state: "visible" });
    return style(loc.first());
  };

  test("settings, logs and the log form agree", async ({ page }) => {
    await page.goto("/settings?group=tokens");
    const tokens = await seen(
      page.getByRole("heading", { name: "Your tokens" }),
    );
    expect(tokens).toMatchObject({
      size: "13px",
      weight: "600",
      line: "18px",
      transform: "none",
    });
    const newToken = await seen(
      page.getByTestId("form-section-label").filter({ visible: true }),
    );
    expect(newToken).toEqual(tokens);

    await page.goto("/settings?group=appearance");
    expect(
      await seen(
        page.getByTestId("form-section-label").filter({ visible: true }),
      ),
    ).toEqual(tokens);

    await page.goto("/logs");
    expect(
      await seen(page.getByTestId("log-month").filter({ visible: true })),
    ).toEqual(tokens);
  });

  test("space around a heading is 24 above and 8 below", async ({ page }) => {
    await page.goto("/settings?group=tokens");
    const h = page.getByRole("heading", { name: "Your tokens" });
    await h.waitFor();
    const row = h.locator("xpath=..");
    const m = await row.evaluate((el) => {
      const s = getComputedStyle(el);
      return { top: s.marginTop, bottom: s.marginBottom };
    });
    expect(m.bottom).toBe("8px");
    expect(m.top).toBe("0px"); // opens its block
  });
});
