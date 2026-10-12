import { expect, type Page, test } from "@playwright/test";
import {
  computed,
  expectNoHorizontalOverflow,
  expectTouchTargets,
  gotoSection,
} from "../support/fixture";

// WP4: the features card of a section (doc/plans/ui-overhaul.md, "Features
// list rules"). Lower Test has: WW III over the whole run, Put in, Slot
// Machine III+ (a range with Big Hole inside), Altes Wehr, Portage (a range
// with Strainer inside), Bridge, Take out.

const card = (page: Page) =>
  page.getByTestId("features-card").filter({ visible: true });
const row = (page: Page, name: string) =>
  card(page).locator("[data-row]").filter({ hasText: name }).first();

async function openFeatures(page: Page) {
  await gotoSection(page, "lower");
  await expect(card(page)).toBeVisible();
}

test.describe("features card", () => {
  test("the header counts the features, the base grade not among them", async ({
    page,
  }) => {
    await openFeatures(page);
    await expect(card(page).getByTestId("features-count")).toHaveText(
      /^8 features/,
    );
  });

  test("access points carry the icon of their type, the rest a number", async ({
    page,
  }) => {
    await openFeatures(page);
    for (const [name, type, n] of [
      ["Put in", "put_in", null],
      ["Slot Machine", "rapid", 1],
      ["Big Hole", "hole", 2],
      ["Altes Wehr", "weir", 3],
      ["Portage", "portage", 4],
      ["Strainer", "strainer", 5],
      ["Bridge", "bridge", 6],
      ["Take out", "take_out", null],
    ] as const) {
      const r = row(page, name);
      await expect(r, `${name} row`).toHaveAttribute("data-type", type);
      if (n == null) {
        const paths = await r.locator("svg path").count();
        expect(paths, `${name} icon drawn`).toBeGreaterThan(0);
      } else {
        await expect(
          r.locator("[data-pin-number]"),
          `${name} number`,
        ).toHaveAttribute("data-pin-number", String(n));
      }
    }
  });

  test("the facts row states the level and thresholds on a desktop card", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "desktop", "facts are a desktop block");
    await openFeatures(page);
    const facts = card(page).getByTestId("section-facts");
    await expect(facts).toContainText("Level now");
    await expect(facts).toContainText("L 60 \u00b7 M 80 \u00b7 H 120");
  });

  test("text is sentence case with km in lower case", async ({ page }) => {
    await openFeatures(page);
    await expect(row(page, "Put in")).toContainText("Put in");
    await expect(row(page, "Put in")).toContainText("0.0 km");
    await expect(row(page, "Slot Machine")).toContainText(/0\.\d-0\.\d km/);
    const text = await card(page).innerText();
    expect(text).not.toMatch(/\bKM\b/);
    expect(text).not.toContain("–");
    const bad = await card(page)
      .locator("*")
      .evaluateAll((els) =>
        els
          .filter((el) => {
            const s = getComputedStyle(el);
            return (
              (el.textContent ?? "").trim() !== "" &&
              (s.textTransform === "uppercase" ||
                (Number.parseFloat(s.letterSpacing) > 0.5 &&
                  el.children.length === 0))
            );
          })
          .map((el) => (el.textContent ?? "").slice(0, 30)),
      );
    expect(bad, "capitals or letter-spaced text").toEqual([]);
  });

  test("km values use tabular figures", async ({ page }) => {
    await openFeatures(page);
    const km = row(page, "Put in").locator("[data-km]");
    expect(await computed(km, "font-variant-numeric")).toContain(
      "tabular-nums",
    );
  });

  test("the base grade has no row and no mark on the strip", async ({
    page,
  }) => {
    await openFeatures(page);
    await expect(card(page).locator("[data-row]")).toHaveCount(8);
    await expect(
      card(page).locator("[data-row]").filter({ hasText: "WW III" }),
    ).toHaveCount(0);
    await expect(card(page).getByTestId("strip-grade")).toHaveCount(0);
  });

  test("no closing rows: each range has one row", async ({ page }) => {
    await openFeatures(page);
    await expect(
      card(page).locator('[data-row][data-type="rapid"]'),
    ).toHaveCount(1);
    await expect(
      card(page).locator('[data-row][data-type="portage"]'),
    ).toHaveCount(1);
  });

  test("a range row shows its span and folds and opens its members", async ({
    page,
  }) => {
    await openFeatures(page);
    const head = card(page).getByRole("button", { name: /Slot Machine/ });
    await expect(head).toHaveAttribute("aria-expanded", "true");
    await expect(head).toContainText(/0\.\d-0\.\d km/);
    const hole = card(page).locator('[data-row][data-type="hole"]');
    await expect(hole).toBeVisible();

    await head.click();
    await expect(head).toHaveAttribute("aria-expanded", "false");
    await expect(hole).toHaveCount(0);
    // A folded range names what it hides.
    await expect(head).toContainText("Big Hole");

    await head.click();
    await expect(head).toHaveAttribute("aria-expanded", "true");
    await expect(hole).toBeVisible();
  });

  test("the strip draws each feature as an icon disc", async ({ page }) => {
    await openFeatures(page);
    const strip = card(page).getByTestId("features-strip");
    await expect(strip).toBeVisible();
    // Seven points on the run plus the two ranges; no disc for ranges.
    expect(await strip.locator("[data-disc]").count()).toBeGreaterThanOrEqual(
      5,
    );
    const takeOut = strip.locator('[data-disc][data-type="take_out"]');
    expect(await computed(takeOut, "fill")).toBe("rgb(14, 116, 144)");
    await expect(
      strip.locator('[data-range][data-type="portage"]'),
    ).toHaveAttribute("stroke-dasharray", /\d/);

    await expect(card(page).locator("[data-row]")).toHaveCount(8);
  });

  test("a portage band keeps a dashed rail", async ({ page }) => {
    await openFeatures(page);
    const rail = card(page)
      .locator('[data-band="portage"] [data-rail]')
      .first();
    await expect(rail).toBeVisible();
    expect(await computed(rail, "border-left-style")).toBe("dashed");
    const plain = card(page).locator('[data-band="range"] [data-rail]').first();
    expect(await computed(plain, "border-left-style")).toBe("solid");
  });

  test("rows are 56px on a desktop, at least 48px on a phone", async ({
    page,
  }, info) => {
    await openFeatures(page);
    const heights = await card(page)
      .locator("[data-row]")
      .evaluateAll((els) =>
        els.map((el) => Math.round(el.getBoundingClientRect().height)),
      );
    expect(heights.length).toBe(8);
    expect(Math.min(...heights), "row heights").toBeGreaterThanOrEqual(
      info.project.name === "desktop" ? 56 : 48,
    );
  });

  test("the rail runs behind the icon discs, never through them", async ({
    page,
  }) => {
    await openFeatures(page);
    const discs = card(page).locator("[data-row] [data-row-disc]");
    const n = await discs.count();
    expect(n).toBeGreaterThanOrEqual(6);
    for (let i = 0; i < n; i++) {
      const d = discs.nth(i);
      await d.scrollIntoViewIfNeeded();
      expect(
        await computed(d, "background-color"),
        `disc ${i} is opaque`,
      ).toMatch(/^rgb\(/);
      const hit = await d.evaluate((el) => {
        const r = el.getBoundingClientRect();
        for (const [fx, fy] of [
          [0.5, 0.5],
          [0.5, 0.15],
          [0.5, 0.85],
        ]) {
          const top = document.elementFromPoint(
            r.left + r.width * fx,
            r.top + r.height * fy,
          );
          if (!top || !el.contains(top)) {
            return top?.getAttribute("data-rail") !== null
              ? "rail"
              : top?.tagName;
          }
        }
        return "ok";
      });
      expect(hit, `disc ${i} is on top of the rail`).toBe("ok");
    }
  });

  test("the card is one block at phone width @small", async ({ page }) => {
    await openFeatures(page);
    await expectNoHorizontalOverflow(page);
    const box = await card(page).boundingBox();
    const vw = page.viewportSize()?.width ?? 0;
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(vw);
    const strip = card(page).getByTestId("features-strip");
    const sb = await strip.boundingBox();
    expect(sb, "the strip is drawn").not.toBeNull();
    const { x, width } = sb as NonNullable<typeof sb>;
    expect(width).toBeGreaterThan(0);
    expect(x + width).toBeLessThanOrEqual(vw);
  });

  test("the panel title is 20px bold and the tabs sit 20px apart", async ({
    page,
  }) => {
    await openFeatures(page);
    const header = page
      .getByRole("button", { name: "Back" })
      .filter({ visible: true })
      .first()
      .locator("xpath=../..");
    const title = header.getByText("Lower Test", { exact: true });
    expect(await computed(title, "font-size")).toBe("20px");
    expect(await computed(title, "font-weight")).toBe("700");
    const tabs = await header.getByRole("tab").evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { left: r.left, right: r.right, h: r.height, w: r.width };
      }),
    );
    expect(tabs.length).toBeGreaterThan(1);
    for (let i = 1; i < tabs.length; i++)
      expect(tabs[i].left - tabs[i - 1].right).toBeCloseTo(20, 0);
    for (const t of tabs) {
      expect(t.h).toBeGreaterThanOrEqual(48);
      expect(t.w).toBeGreaterThanOrEqual(56);
    }
  });

  test("the header's icons are 44px to hit", async ({ page }) => {
    await openFeatures(page);
    const icons = page
      .getByRole("button", {
        name: /View on map|Section actions/,
      })
      .filter({ visible: true });
    expect(await icons.count()).toBeGreaterThan(0);
    await expectTouchTargets(icons);
  });

  test("the card has no fold chevron and no menu of its own", async ({
    page,
  }) => {
    await openFeatures(page);
    await expect(card(page).getByTestId("features-fold")).toHaveCount(0);
    await expect(card(page).getByRole("button")).toHaveCount(0);
  });
});

async function openNotes(page: Page, url: string) {
  await page.goto(url);
  await page
    .getByRole("tab", { name: "Notes" })
    .filter({ visible: true })
    .click();
}

test.describe("notes", () => {
  test("a section note is a calm card: dot, label, author and age", async ({
    page,
  }) => {
    await openNotes(page, "/?waterway=9001&section=9102");
    const note = page
      .getByTestId("note-card")
      .filter({ visible: true, hasText: "Portage the weir" });
    await expect(note).toBeVisible();
    await expect(note).toContainText("Permanent hazard");
    expect(await computed(note, "border-radius")).toBe("14px");
    expect(await computed(note, "background-color")).toBe("rgb(255, 255, 255)");
    expect(
      await computed(note.getByTestId("note-dot"), "background-color"),
    ).toBe("rgb(133, 84, 0)");
    const meta = note.getByText(/ago|just now|\d+ ?[a-z]/i).last();
    expect(await computed(meta, "font-size")).toBe("12px");
    expect(await computed(meta, "color")).toBe("rgb(124, 138, 144)");
    const caps = await note.evaluate((el) =>
      [...el.querySelectorAll("*")].some(
        (e) => getComputedStyle(e).textTransform === "uppercase",
      ),
    );
    expect(caps, "capitals in a note").toBe(false);
  });

  test("a merged note is dimmed, not hidden", async ({ page }) => {
    await openNotes(page, "/?waterway=9001");
    const merged = page
      .getByTestId("note-card")
      .filter({ visible: true, hasText: "New siphon" });
    await expect(merged).toBeVisible();
    expect(Number(await computed(merged, "opacity"))).toBeLessThan(0.7);
    const live = page
      .getByTestId("note-card")
      .filter({ visible: true, hasText: "Tree across" });
    expect(await computed(live, "opacity")).toBe("1");
  });
});

test.describe("chart height", () => {
  test("the chart opens the Features pane, above the list, and the list stays readable @small", async ({
    page,
  }, info) => {
    test.skip(
      info.project.name === "desktop",
      "the desktop's chart is the rail",
    );
    await openFeatures(page);
    const chart = page.getByTestId("chart-card").filter({ visible: true });
    await expect(chart).toBeVisible();
    const pane = page.getByTestId("tab-pane").filter({ visible: true });
    const inPane = await chart.evaluate(
      (el) => !!el.closest('[data-testid="tab-pane"]'),
    );
    expect(inPane, "the chart is inside the tab pane").toBe(true);
    const c = (await chart.boundingBox()) as NonNullable<
      Awaited<ReturnType<typeof chart.boundingBox>>
    >;
    const f = (await card(page).boundingBox()) as NonNullable<typeof c>;
    const p = (await pane.boundingBox()) as NonNullable<typeof c>;
    expect(
      c.y + c.height,
      "chart ends before the list starts",
    ).toBeLessThanOrEqual(f.y);
    if ((page.viewportSize()?.width ?? 0) < 768) {
      expect(c.y, "chart sits at the top of the pane").toBeLessThan(p.y + 24);
      // The list's strip can be read below the chart without scrolling.
      const strip = (await card(page)
        .getByTestId("features-strip")
        .boundingBox()) as typeof c;
      expect(strip.y + strip.height, "strip inside the pane").toBeLessThan(
        p.y + p.height,
      );
    }
  });
});

test.describe("whole-run grade", () => {
  test("its edit and delete live in the header menu", async ({ page }) => {
    await openFeatures(page);
    await expect(row(page, "WW III")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Section actions" })
      .filter({ visible: true })
      .click();
    await expect(
      page.getByRole("menuitem", { name: "Edit grade" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Delete grade" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  });
});

test.describe("design gaps", () => {
  test("rows follow the calm rail: weights, disc, indent, no band menu", async ({
    page,
  }) => {
    await openFeatures(page);
    const name = (n: string) => row(page, n).locator("span").first();
    expect(await computed(name("Put in"), "font-weight")).toBe("500");
    expect(
      await computed(row(page, "Put in").locator("[data-km]"), "font-weight"),
    ).toBe("500");
    expect(await computed(name("Slot Machine"), "font-weight")).toBe("600");
    const disc = await row(page, "Put in")
      .locator("[data-row-disc]")
      .boundingBox();
    expect(disc?.width).toBe(28);
    const head = await name("Slot Machine").boundingBox();
    const member = await name("Big Hole").boundingBox();
    expect((member?.x ?? 0) - (head?.x ?? 0)).toBe(24);
    await expect(
      card(page).getByRole("button", { name: "More actions" }),
    ).toHaveCount(0);
  });

  test("the header holds the count and nothing else", async ({ page }) => {
    await openFeatures(page);
    const count = card(page).getByTestId("features-count");
    expect(await computed(count, "font-size")).toBe("13px");
    await expect(count.locator("button")).toHaveCount(0);
  });

  test("a picked row shows 44px coordinate buttons in secondary ink", async ({
    page,
  }) => {
    await openFeatures(page);
    await row(page, "Altes Wehr").click();
    const open = card(page).getByTitle("Open in Google Maps");
    await expectTouchTargets(open);
    expect(await computed(open, "color")).toBe("rgb(88, 102, 109)");
    await row(page, "Altes Wehr").click();
  });
});

test.describe("features card seams", () => {
  test("the selected row carries a 2px teal ring", async ({ page }) => {
    await openFeatures(page);
    const r = row(page, "Altes Wehr");
    expect(await computed(r, "outline-style")).toBe("none");
    await r.click();
    expect(await computed(r, "outline-width")).toBe("2px");
    expect(await computed(r, "outline-style")).toBe("solid");
    expect(await computed(r, "outline-color")).toBe("rgb(14, 116, 144)");
    await r.click();
  });

  test("a point's icon is 18px in its disc, a range band has a 12px radius", async ({
    page,
  }) => {
    await openFeatures(page);
    const icon = row(page, "Put in").locator("[data-row-disc] svg");
    expect(await computed(icon, "width")).toBe("18px");
    const band = card(page).locator("[data-band]").first();
    expect(await computed(band, "border-top-left-radius")).toBe("12px");
  });
});
