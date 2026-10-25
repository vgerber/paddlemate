import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// An open day holds its action buttons, so the button role sits on the header
// row alone (TripTimeline DayEntry).

test("an open day has no nested interactive and a named header", async ({
  page,
}) => {
  await page.goto("/trips/9001");
  const day = page.getByTestId("plan-day").filter({ visible: true }).first();
  await expect(day).toBeVisible();
  const header = day.getByRole("button", { expanded: false }).first();
  await header.click();
  const open = day.getByRole("button", { expanded: true });
  await expect(open).toHaveCount(1);
  await expect(day.getByRole("button").nth(1)).toBeVisible();
  const name = (await open.innerText()).replace(/\s+/g, " ").trim();
  await expect(open).toHaveAccessibleName(name);
  expect(name.length).toBeLessThan(40);
  const res = await new AxeBuilder({ page })
    .include("[data-testid=plan-day]")
    .analyze();
  expect(res.violations.filter((v) => v.id === "nested-interactive")).toEqual(
    [],
  );
});
