import { expect, type Page, test } from "@playwright/test";
import { expectNoHorizontalOverflow } from "../support/fixture";
import { API, bearer, signInAs } from "../support/signIn";

// Wiki changes from a paddler who is not an admin wait for review. Entry 9852
// is the Testflow Cascade M (22 kg). Jonas is the fixture's non-admin; the
// stored session is the admin Vincent. Every test puts the data back: a
// proposal it made is withdrawn, an entry it changed is written back.

const ENTRY = 9852;
const proposalId = (page: Page, method: string) =>
  page
    .waitForResponse(
      (r) =>
        r.url().includes("/api/v1/materials") &&
        r.request().method() === method,
    )
    .then(async (r) => {
      expect(r.status(), "a paddler's write is held for review").toBe(202);
      return (await r.json()).id as number;
    });

async function withdraw(page: Page, id: number) {
  await page.request.delete(`${API}/api/v1/proposals/${id}`, {
    headers: await bearer(page),
  });
}

test.describe("as a paddler who is not an admin", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("an edit is sent for review and the entry stays @write @small", async ({
    page,
  }) => {
    await signInAs(page, "jonas");
    await page.goto(`/materials/${ENTRY}?edit=true`);
    await page.getByLabel(/^Weight/).fill("21.7");
    await page.getByLabel("Note for reviewers").fill("Maker page says 21.7");
    const sent = page.waitForRequest(
      (r) => r.method() === "PUT" && r.url().includes(`/materials/${ENTRY}`),
    );
    const created = proposalId(page, "PUT");
    await page.getByRole("button", { name: "Save entry" }).click();
    const id = await created;
    try {
      // The form keeps sending every field, plus the note.
      const body = (await sent).postDataJSON();
      expect(body).toMatchObject({
        brand: "Testflow",
        model: "Cascade",
        size: "M",
        weight_kg: 21.7,
        proposal_note: "Maker page says 21.7",
      });
      expect(Object.keys(body).length).toBeGreaterThan(10);

      await expect(page.getByTestId("proposal-sent")).toContainText(
        "Sent for review",
      );
      await expect(page).not.toHaveURL(/edit=true/);
      await expect(page.getByText("22 kg").first()).toBeVisible();
      await expect(page.getByText("21.7 kg")).toHaveCount(0);

      const note = page.getByTestId("pending-proposals");
      await expect(note).toContainText("Your change is waiting for review");
      await expectNoHorizontalOverflow(page);
      await note.getByRole("link", { name: "View" }).click();
      await expect(page).toHaveURL(new RegExp(`/proposals/${id}`));
      await expect(page.getByTestId("diff-table")).toContainText("Weight");
    } finally {
      await withdraw(page, id);
    }
  });

  test("a delete is sent for review and the entry stays @write", async ({
    page,
  }) => {
    await signInAs(page, "jonas");
    await page.goto(`/materials/${ENTRY}`);
    await page.getByRole("button", { name: "Entry actions" }).click();
    await page.getByRole("menuitem", { name: "Delete entry" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("until an admin has taken a look");
    const created = proposalId(page, "DELETE");
    await dialog.getByRole("button", { name: "Send for review" }).click();
    const id = await created;
    try {
      await expect(page.getByTestId("proposal-sent")).toContainText(
        "Sent for review",
      );
      // The entry is still there, with a note that the request waits.
      await expect(dialog).toBeHidden();
      await expect(page).toHaveURL(new RegExp(`/materials/${ENTRY}`));
      await expect(page.getByTestId("pending-proposals")).toContainText(
        "Your removal request is waiting for review",
      );
    } finally {
      await withdraw(page, id);
    }
  });
});

test.describe("as the admin", () => {
  test("a pending edit is listed with its diff, approving applies it @write", async ({
    page,
    browser,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    const adminHeaders = await (async () => {
      await page.goto("/");
      return bearer(page);
    })();
    const original = await (
      await page.request.get(`${API}/api/v1/materials/${ENTRY}`)
    ).json();

    const paddler = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    const jonas = await paddler.newPage();
    let id = 0;
    try {
      await signInAs(jonas, "jonas");
      const res = await jonas.request.put(`${API}/api/v1/materials/${ENTRY}`, {
        headers: await bearer(jonas),
        data: { ...original, weight_kg: 21.7, proposal_note: "Maker page" },
      });
      expect(res.status()).toBe(202);
      id = (await res.json()).id;

      // The list filters by type and names the proposal like the entry.
      await page.goto("/proposals?entity_type=material");
      const card = page
        .getByTestId("proposal-card")
        .filter({ hasText: "Testflow Cascade M" })
        .filter({ visible: true });
      await expect(card.first()).toBeVisible();
      await page.goto("/proposals?entity_type=feature");
      await expect(
        page.getByTestId("proposal-card").filter({ hasText: "Testflow" }),
      ).toHaveCount(0);

      await page.goto(`/proposals/${id}`);
      const diff = page.getByTestId("diff-table").filter({ visible: true });
      await expect(diff.getByTestId("diff-key")).toHaveText(["Weight"]);
      await expect(diff.getByTestId("diff-before")).toHaveText("22 kg");
      await expect(diff.getByTestId("diff-after")).toHaveText("21.7 kg");
      await expect(
        page.getByTestId("proposal-submitter-note").filter({ visible: true }),
      ).toContainText("Maker page");

      await page.getByRole("button", { name: "Approve" }).first().click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "Approve" }).click();
      await expect(dialog).toBeHidden();

      await page.goto(`/materials/${ENTRY}`);
      await expect(page.getByText("21.7 kg").first()).toBeVisible();
    } finally {
      await page.request.put(`${API}/api/v1/materials/${ENTRY}`, {
        headers: adminHeaders,
        data: original,
      });
      if (id) {
        await jonas.request.delete(`${API}/api/v1/proposals/${id}`, {
          headers: await bearer(jonas),
        });
      }
      await paddler.close();
    }
  });
});
