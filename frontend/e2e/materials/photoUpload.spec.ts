import { expect, type Page, test } from "@playwright/test";
import { pickEntryAction } from "../support/entryMenu";
import { expectNoHorizontalOverflow } from "../support/fixture";
import { API, bearer, signInAs } from "../support/signIn";

// Adding a photo to a wiki entry. Entry 9852 is the Testflow Cascade M, which
// has no photo; 9851 (S) and 9853 (L) are its other sizes. The stored session
// is the admin Vincent, Jonas the fixture's non-admin. Every test that
// uploads takes the photo down again.

const ENTRY = 9852;
const SIZE_S = 9851;

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function pickPhoto(page: Page) {
  await pickEntryAction(page, "Add photo");
  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("add-photo-input").setInputFiles({
    name: "paddle.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(dialog.getByTestId("add-photo-preview")).toBeVisible();
  return dialog;
}

async function imagesOf(page: Page, id: number) {
  const res = await page.request.get(`${API}/api/v1/materials/${id}`);
  return (await res.json()).images as { id: number; credit: string }[];
}

async function takeDown(page: Page, entry: number, imageId: number) {
  await page.request.delete(
    `${API}/api/v1/materials/${entry}/images/${imageId}`,
    { headers: await bearer(page) },
  );
}

test("the form needs a photo and the rights statement @small", async ({
  page,
}) => {
  await page.goto(`/materials/${ENTRY}`);
  const dialog = await pickPhoto(page);
  const send = dialog.getByRole("button", { name: "Add photo" });
  await expect(send).toBeDisabled();
  await expect(dialog.getByLabel("Credit")).toHaveAttribute(
    "placeholder",
    "vincent",
  );
  const rights = dialog.getByRole("checkbox");
  const box = await rights.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await rights.check();
  await expect(send).toBeEnabled();
  await rights.uncheck();
  await expect(send).toBeDisabled();
  await dialog.getByLabel("Credit").fill("Someone Else");
  await expect(dialog).toContainText('Photo: Someone Else"');
  await expectNoHorizontalOverflow(page);
  for (const button of await dialog.getByRole("button").all()) {
    const size = await button.boundingBox();
    expect(size?.height).toBeGreaterThanOrEqual(44);
  }
});

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the dialog offers sign-in instead of the form @small", async ({
    page,
  }) => {
    await page.goto(`/materials/${ENTRY}`);
    await pickEntryAction(page, "Add photo");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Sign in to add a photo");
    await expect(dialog.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(dialog.getByTestId("add-photo-input")).toHaveCount(0);
  });
});

test("an admin's photo is live on every size of the model @write", async ({
  page,
}) => {
  await page.goto(`/materials/${ENTRY}`);
  const dialog = await pickPhoto(page);
  await dialog.getByLabel("Credit").fill("Test Paddler");
  await dialog.getByRole("checkbox").check();
  const sent = page.waitForResponse(
    (r) =>
      r.url().includes(`/materials/${ENTRY}/images`) &&
      r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Add photo" }).click();
  const response = await sent;
  expect(response.status()).toBe(201);
  const image = await response.json();
  try {
    await expect(dialog).toBeHidden();
    const photo = page.getByTestId("material-photo");
    await expect(photo).toHaveCount(1);
    await expect(photo).toContainText("Photo: Test Paddler");
    // No source page: the credit is text, not a link.
    await expect(photo.getByRole("link")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    await page.goto(`/materials/${SIZE_S}`);
    await expect(page.getByTestId("material-photo")).toContainText(
      "Photo: Test Paddler",
    );
  } finally {
    await takeDown(page, ENTRY, image.id);
  }
  expect(await imagesOf(page, ENTRY)).toHaveLength(0);
});

test("an oversized or non-image file is refused before it is sent @small", async ({
  page,
}) => {
  await page.goto(`/materials/${ENTRY}`);
  await pickEntryAction(page, "Add photo");
  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("add-photo-input").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello"),
  });
  await expect(dialog.getByRole("alert")).toContainText("JPEG, PNG");
  await expect(dialog.getByTestId("add-photo-preview")).toHaveCount(0);
});

test.describe("as the admin reviewing a paddler's photo", () => {
  test("it waits for review, shows after approval @write", async ({
    page,
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    const adminHeaders = await bearer(page);
    const paddler = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    const jonas = await paddler.newPage();
    let proposalId = 0;
    let imageId = 0;
    try {
      await signInAs(jonas, "jonas");
      await jonas.goto(`/materials/${ENTRY}`);
      const dialog = await pickPhoto(jonas);
      await dialog.getByRole("checkbox").check();
      const sent = jonas.waitForResponse(
        (r) =>
          r.url().includes(`/materials/${ENTRY}/images`) &&
          r.request().method() === "POST",
      );
      await dialog.getByRole("button", { name: "Send for review" }).click();
      const response = await sent;
      expect(response.status()).toBe(202);
      const proposal = await response.json();
      proposalId = proposal.id;
      imageId = proposal.proposed_data.image_id;

      await expect(jonas.getByTestId("proposal-sent")).toContainText(
        "Sent for review",
      );
      await expect(jonas.getByTestId("material-photo")).toHaveCount(0);
      await expect(jonas.getByTestId("pending-proposals")).toContainText(
        "Your photo is waiting for review",
      );
      expect(await imagesOf(page, ENTRY)).toHaveLength(0);

      // The admin sees the picture and approves it.
      await page.goto(`/proposals/${proposalId}`);
      const shown = page
        .getByTestId("proposal-photo-image")
        .filter({ visible: true });
      await expect(shown).toBeVisible();
      await expect
        .poll(() => shown.evaluate((img: HTMLImageElement) => img.naturalWidth))
        .toBeGreaterThan(0);
      await expect(
        page.getByTestId("proposal-photo").filter({ visible: true }),
      ).toContainText("jonas");
      await page.getByRole("button", { name: "Approve" }).first().click();
      const confirm = page.getByRole("dialog");
      await confirm.getByRole("button", { name: "Approve" }).click();
      await expect(confirm).toBeHidden();

      await jonas.goto(`/materials/${ENTRY}`);
      await expect(jonas.getByTestId("material-photo")).toContainText(
        "Photo: jonas",
      );
      await expectNoHorizontalOverflow(jonas);
    } finally {
      if (imageId) await takeDown(page, ENTRY, imageId);
      if (proposalId) {
        await jonas.request.delete(`${API}/api/v1/proposals/${proposalId}`, {
          headers: await bearer(jonas),
        });
      }
      await paddler.close();
    }
    expect(adminHeaders.Authorization).toBeTruthy();
    expect(await imagesOf(page, ENTRY)).toHaveLength(0);
  });

  test("a paddler withdraws a waiting photo @write", async ({
    page,
    browser,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    const paddler = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    const jonas = await paddler.newPage();
    try {
      await signInAs(jonas, "jonas");
      const headers = await bearer(jonas);
      const res = await jonas.request.post(
        `${API}/api/v1/materials/${ENTRY}/images`,
        {
          headers,
          multipart: {
            file: { name: "p.png", mimeType: "image/png", buffer: PNG },
            rights_confirmed: "true",
          },
        },
      );
      expect(res.status()).toBe(202);
      const proposal = await res.json();
      const preview = `${API}/api/v1/materials/${ENTRY}/images/${proposal.proposed_data.image_id}/preview`;
      expect((await jonas.request.get(preview, { headers })).status()).toBe(
        200,
      );
      const gone = await jonas.request.delete(
        `${API}/api/v1/proposals/${proposal.id}`,
        { headers },
      );
      expect(gone.status()).toBe(204);
      expect((await jonas.request.get(preview, { headers })).status()).toBe(
        404,
      );
    } finally {
      await paddler.close();
    }
    expect(await imagesOf(page, ENTRY)).toHaveLength(0);
  });
});
