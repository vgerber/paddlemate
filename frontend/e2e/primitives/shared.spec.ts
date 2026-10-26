import { expect, type Page, test } from "@playwright/test";
import { parseColour } from "../support/colour";
import {
  appReady,
  computed,
  expectNoHorizontalOverflow,
  expectTouchTargets,
} from "../support/fixture";

// WP1b: the shared components in the calm design (doc/design.md). These hold
// the pills, the docked action, the dialog, the empty state and the label
// type to what the browser computes. The pills need fresh gauge readings: if
// they are missing, reseed the fixture (.claude/skills/test-data).

async function openSectionList(page: Page) {
  await page.goto("/?waterway=9001");
  await appReady(page);
  await expect(
    page.locator("[data-level]:visible").first(),
    "level pills drawn (reseed the fixture if its readings are old)",
  ).toBeVisible();
}

function pill(page: Page, section: string) {
  return page
    .locator(".MuiListItemButton-root:visible")
    .filter({ hasText: section })
    .locator("[data-level]")
    .first();
}

test("level pills: high solid red, low green wash, medium amber wash, empty hollow", async ({
  page,
}) => {
  await openSectionList(page);

  const high = pill(page, "High Water Test");
  await expect(high).toHaveAttribute("data-level", "high");
  expect(await computed(high, "background-color")).toBe("rgb(180, 55, 63)");
  expect(await computed(high, "color")).toBe("rgb(255, 255, 255)");
  expect(await computed(high, "height")).toBe("24px");
  expect(
    Number.parseFloat(await computed(high, "border-top-left-radius")),
  ).toBeGreaterThanOrEqual(12);

  const low = pill(page, "Low Water Test");
  await expect(low).toHaveAttribute("data-level", "low");
  expect(await computed(low, "color")).toBe("rgb(29, 107, 79)");
  expect(await computed(low, "background-color")).toBe(
    "rgba(29, 107, 79, 0.13)",
  );
  expect(await computed(low, "height")).toBe("24px");

  const medium = pill(page, "Lower Test");
  await expect(medium).toHaveAttribute("data-level", "medium");
  expect(await computed(medium, "color")).toBe("rgb(133, 84, 0)");
  expect(await computed(medium, "background-color")).toBe(
    "rgba(133, 84, 0, 0.15)",
  );

  const dry = pill(page, "Dry Test");
  await expect(dry).toHaveAttribute("data-level", "empty");
  expect(await computed(dry, "background-color")).toBe("rgba(0, 0, 0, 0)");
  expect(await computed(dry, "border-top-width")).toBe("1px");
  expect(await computed(dry, "height")).toBe("24px");
  const dot = dry.locator("[data-dot]");
  expect(await computed(dot, "background-color")).toBe("rgba(0, 0, 0, 0)");
  expect(await computed(dot, "border-top-width")).toBe("2px");
});

test.describe("docked action", () => {
  test("a desktop pane ends in a teal button at least 44px tall", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "desktop", "docked from md up only");
    await openSectionList(page);
    const action = page.getByRole("button", { name: "New section" });
    await expect(action).toBeVisible();
    expect(await computed(action, "background-color")).toBe(
      "rgb(14, 116, 144)",
    );
    await expectTouchTargets(action);
    const box = await action.boundingBox();
    expect(box?.width, "full pane width").toBeGreaterThan(300);
  });
});

test.describe("confirm dialog", () => {
  test("has the dialog radius, the floating shadow and 44px buttons", async ({
    page,
  }) => {
    // A section's own address: the phone shows the list first, the desktop
    // opens Account beside it.
    await page.goto("/settings?group=tokens");
    await page
      .getByRole("button", { name: "Token actions" })
      .filter({ visible: true })
      .first()
      .click();
    await page.getByRole("menuitem", { name: "Revoke" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const paper = page.locator(".MuiDialog-paper");
    expect(await computed(paper, "border-top-left-radius")).toBe("20px");
    expect(await computed(paper, "box-shadow")).toBe(
      "rgba(31, 43, 49, 0.12) 0px 8px 24px 0px, rgba(31, 43, 49, 0.08) 0px 2px 6px 0px",
    );
    expect(
      await computed(dialog.locator(".MuiDialogTitle-root"), "font-weight"),
    ).toBe("700");
    await expectTouchTargets(dialog.getByRole("button"));
    const confirm = dialog.getByRole("button", { name: "Revoke" });
    expect(await computed(confirm, "background-color")).toBe(
      "rgb(180, 55, 63)",
    );
    expect(await computed(confirm, "color")).toBe("rgb(255, 255, 255)");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });
});

test.describe("empty state", () => {
  test("is an icon in a soft teal tile and one line", async ({
    page,
  }, info) => {
    // The reseeded fixture has an inbox, so the empty detail pane beside a
    // desktop list is the one empty state left to look at.
    test.skip(info.project.name !== "desktop", "empty panes are desktop");
    await page.goto("/proposals");
    const empty = page.getByTestId("empty-state");
    await expect(empty).toBeVisible();
    const tile = empty.getByTestId("state-tile");
    await expect(tile).toBeVisible();
    expect(await computed(tile, "width")).toBe("48px");
    expect(await computed(tile, "height")).toBe("48px");
    expect(await computed(tile, "border-top-left-radius")).toBe("14px");
    const wash = await computed(tile, "background-color");
    const [r, g, b, a] = parseColour(wash);
    expect([r, g, b]).toEqual([14, 116, 144]);
    expect(a, "a wash, not a solid").toBeLessThan(1);
    expect(await computed(tile, "color")).toBe("rgb(14, 116, 144)");
    expect(await computed(empty, "text-align")).toBe("center");
  });
});

test.describe("labels", () => {
  test("fact labels and form headings are sentence case", async ({ page }) => {
    await page.goto("/settings?group=language");
    const labels = page.locator(
      '[data-testid="fact-label"]:visible, [data-testid="form-section-label"]:visible',
    );
    await expect(labels.first()).toBeVisible();
    const style = await labels.evaluateAll((els) =>
      els.map((e) => {
        const s = getComputedStyle(e);
        return {
          text: e.textContent,
          transform: s.textTransform,
          spacing: s.letterSpacing,
          size: Number.parseFloat(s.fontSize),
        };
      }),
    );
    expect(style.length).toBeGreaterThan(0);
    for (const l of style) {
      expect(l.transform, `${l.text} transform`).toBe("none");
      expect(["normal", "0px"], `${l.text} spacing`).toContain(l.spacing);
      expect(l.size, `${l.text} size`).toBeGreaterThanOrEqual(12);
    }
    await expectNoHorizontalOverflow(page);
  });

  test("a form heading is 13px and semibold", async ({ page }) => {
    await page.goto("/settings?group=language");
    const heading = page.getByTestId("form-section-label").first();
    await expect(heading).toBeVisible();
    expect(await computed(heading, "font-size")).toBe("13px");
    expect(await computed(heading, "font-weight")).toBe("600");
  });
});
