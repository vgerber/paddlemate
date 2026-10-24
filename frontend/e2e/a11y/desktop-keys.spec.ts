import { expect, type Page, test } from "@playwright/test";
import { appReady, FIX } from "../support/fixture";

// Keyboard on the desktop canvas: Tab reaches the cards before the map's
// controls, Escape is Back, and focus returns to the row that opened a card.

test.skip(({ isMobile }) => isMobile, "the canvas is the desktop's");

const rows = (page: Page) =>
  page.locator("section[data-testid^='canvas-card-'] .MuiListItemButton-root");

/** The element focus is on, as a short description. */
const active = (page: Page) =>
  page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    return {
      tag: a?.tagName ?? "",
      label: a?.getAttribute("aria-label") ?? "",
      text: (a?.textContent ?? "").trim().slice(0, 40),
      inCard: Boolean(a?.closest("section[data-testid^='canvas-card-']")),
      inMap: Boolean(a?.closest(".maplibregl-map")),
    };
  });

async function openList(page: Page) {
  await page.goto("/?q=Test");
  await appReady(page);
  await expect(rows(page).first()).toBeVisible({ timeout: 15_000 });
}

/** Focus the first row by keyboard, from the top of the page. */
async function tabToFirstRow(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  const first = rows(page).first();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    if (await first.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error("Tab never reached the first row");
}

test("Tab reaches the cards before the map's controls", async ({ page }) => {
  await openList(page);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  let sawCard = false;
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    const a = await active(page);
    if (a.inCard) sawCard = true;
    if (a.inMap) {
      expect(sawCard, "a map control came before any card").toBe(true);
      return;
    }
  }
  throw new Error("Tab never reached the map");
});

test("Enter opens a river, Escape goes back to its row", async ({ page }) => {
  await openList(page);
  await tabToFirstRow(page);
  const name = (await active(page)).text;
  await page.keyboard.press("Enter");
  const back = page.locator("[data-panel-back]").first();
  await expect(back).toBeVisible();
  await expect(back).toBeFocused();
  await expect(page).toHaveURL(/waterway=/);
  // A section opens its river as well: one Escape per level.
  for (let i = 0; i < 2 && /waterway=/.test(page.url()); i++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }
  await expect(page).not.toHaveURL(/waterway=/);
  await expect.poll(async () => (await active(page)).text).toBe(name);
});

test("Tab through a river and a section stays on visible controls", async ({
  page,
}) => {
  await page.goto(`/?waterway=${FIX.waterway}&section=${FIX.sections.upper}`);
  await appReady(page);
  await expect(page.locator("[data-panel-back]").first()).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const visible = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      if (!a || a === document.body) return true;
      const r = a.getBoundingClientRect();
      const s = getComputedStyle(a);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden";
    });
    expect(visible, `Tab stop ${i} is hidden`).toBe(true);
  }
});

test("Escape in a filled field does not go back, in an empty one it does", async ({
  page,
}) => {
  await page.goto(`/?waterway=${FIX.waterway}&section=${FIX.sections.upper}`);
  await appReady(page);
  const back = page.locator("[data-panel-back]").first();
  await expect(back).toBeVisible();
  // A filled text field inside the card keeps its Escape.
  await page.evaluate(() => {
    const card = document.querySelector("section[data-testid^='canvas-card-']");
    const input = document.createElement("input");
    input.id = "probe";
    input.value = "x";
    card?.appendChild(input);
    input.focus();
  });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/section=/);
  await page.evaluate(() => {
    (document.getElementById("probe") as HTMLInputElement).value = "";
  });
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/section=/);
});

test("a menu closes on Escape without going back", async ({ page }) => {
  await page.goto(`/?waterway=${FIX.waterway}&section=${FIX.sections.upper}`);
  await appReady(page);
  const back = page.locator("[data-panel-back]").first();
  await expect(back).toBeVisible();
  const more = page
    .locator("section[data-testid^='canvas-card-'] [aria-haspopup='menu']")
    .first();
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(back).toBeVisible();
});
