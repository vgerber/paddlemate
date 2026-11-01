import { expect, type Page, test } from "@playwright/test";
import { expectNoHorizontalOverflow } from "../support/fixture";
import { API, bearer, signInAs } from "../support/signIn";

// The "Suggest a change" block of a model page. Entry 9852 is the Testflow
// Cascade M, which has no photo.

const ENTRY = 9852;

test("the block names what the entry misses and opens the form", async ({
  page,
}) => {
  await page.goto(`/materials/${ENTRY}`);
  const block = page.getByTestId("suggest-change");
  await expect(block).toContainText(/^No .* yet/);
  await expect(block).toContainText("photo");
  await expectNoHorizontalOverflow(page);
  const button = block.getByRole("button", { name: "Suggest a change" });
  const box = await button.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await button.click();
  await expect(page).toHaveURL(/edit=true/);
  await expect(
    page.getByText("Suggest a change").locator("visible=true").first(),
  ).toBeVisible();
});

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the suggestion leads to the sign-in card @small", async ({ page }) => {
    await page.goto(`/materials/${ENTRY}`);
    await page.getByRole("button", { name: "Suggest a change" }).click();
    const card = page.getByTestId("state-card");
    await expect(card).toContainText("Sign in to suggest a change");
    await expect(card.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("as a paddler who is not an admin", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a suggestion is sent as a proposal @write", async ({ page }) => {
    await signInAs(page, "jonas");
    await page.goto(`/materials/${ENTRY}`);
    await page.getByRole("button", { name: "Suggest a change" }).click();
    await page.getByLabel(/^Weight/).fill("21.9");
    await page.getByLabel("Note for reviewers").fill("Suggested from the page");
    const sent = waitForProposal(page);
    await page.getByRole("button", { name: "Save entry" }).click();
    const id = await sent;
    try {
      await expect(page.getByTestId("proposal-sent")).toContainText(
        "Sent for review",
      );
    } finally {
      await page.request.delete(`${API}/api/v1/proposals/${id}`, {
        headers: await bearer(page),
      });
    }
  });
});

function waitForProposal(page: Page) {
  return page
    .waitForResponse(
      (r) =>
        r.url().includes("/api/v1/materials") && r.request().method() === "PUT",
    )
    .then(async (r) => {
      expect(r.status()).toBe(202);
      return (await r.json()).id as number;
    });
}
