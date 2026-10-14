import { expect, type Page, test } from "@playwright/test";
import {
  appReady,
  computed,
  expectNoHorizontalOverflow,
  expectTouchTargets,
  FIX,
  gotoSection,
} from "../support/fixture";
import {
  mockRegions,
  REGIONS,
  SHARED_POINT,
  SOLO_POINT,
  VIEW,
} from "./regions.mock";

// WP7: the map and its regions. The map is read through the dev-only
// `__paddlemateMap` hook (the MapLibre instance), so the checks hold the
// paint and the data the browser really draws, not our intentions.

const TEAL = "#0e7490";
const WHITE = "#ffffff";
const INK = "#58666d";
const E2 =
  "rgba(31, 43, 49, 0.12) 0px 8px 24px 0px, rgba(31, 43, 49, 0.08) 0px 2px 6px 0px";

/** A map with its controls reachable: a phone's detail overlay would cover
 * the map of an open section, so there the region search stands in. */
async function gotoControls(page: Page, isMobile: boolean) {
  if (!isMobile) return gotoSection(page, "lower");
  await page.goto("/?mode=region");
  await appReady(page);
}

/** On a canvas screen the layer choices sit behind one key; open it. */
async function openLayers(page: Page) {
  const key = page.getByTestId("map-layer-button");
  if (await key.count()) await key.click();
}

type FeatureCollection = {
  features: {
    properties?: Record<string, unknown> | null;
    geometry: { type: string };
  }[];
};

type MapHook = {
  getPaintProperty(layer: string, prop: string): unknown;
  getLayoutProperty(layer: string, prop: string): unknown;
  getSource(id: string): { serialize(): { data: FeatureCollection } };
  getImage(id: string): { data: { data: Uint8Array } } | undefined;
  project(lngLat: [number, number]): { x: number; y: number };
  jumpTo(o: { center: [number, number]; zoom: number }): void;
  getCanvas(): HTMLCanvasElement;
  loaded(): boolean;
  setBearing(deg: number): void;
  getBearing(): number;
  queryRenderedFeatures(
    at: { x: number; y: number },
    o: { layers: string[] },
  ): unknown[];
};
declare global {
  interface Window {
    __paddlemateMap?: MapHook;
  }
}

const paint = (page: Page, layer: string, prop: string) =>
  page.evaluate(
    ([l, p]) => window.__paddlemateMap?.getPaintProperty(l, p),
    [layer, prop],
  );

const layout = (page: Page, layer: string, prop: string) =>
  page.evaluate(
    ([l, p]) => window.__paddlemateMap?.getLayoutProperty(l, p),
    [layer, prop],
  );

const sourceFeatures = (page: Page, source: string) =>
  page.evaluate((s) => {
    const data = window.__paddlemateMap?.getSource(s)?.serialize().data;
    return (data?.features ?? []).map((f) => ({
      id: f.properties?.id as number | undefined,
      label: f.properties?.label as string | undefined,
      geometry: f.geometry.type,
    }));
  }, source);

async function openRegionMap(page: Page) {
  await mockRegions(page);
  await page.goto("/?mode=region");
  await appReady(page);
  await page.waitForFunction(() => window.__paddlemateMap?.loaded());
  await page.evaluate(
    ([center, zoom]) =>
      window.__paddlemateMap?.jumpTo({
        center: center as [number, number],
        zoom: zoom as number,
      }),
    [VIEW.center, VIEW.zoom],
  );
  await expect
    .poll(async () => (await sourceFeatures(page, "region-browse")).length)
    .toBeGreaterThan(0);
}

async function clickAt(page: Page, lngLat: [number, number]) {
  // The click only counts once the region under the point has been drawn.
  await expect
    .poll(() =>
      page.evaluate((p) => {
        const map = window.__paddlemateMap;
        const pt = map?.project(p);
        return pt
          ? (map?.queryRenderedFeatures(pt, { layers: ["region-browse-fill"] })
              .length ?? 0)
          : 0;
      }, lngLat),
    )
    .toBeGreaterThan(0);
  const at = await page.evaluate((p) => {
    const map = window.__paddlemateMap;
    const box = map?.getCanvas().getBoundingClientRect();
    const pt = map?.project(p);
    return {
      x: (box?.x ?? 0) + (pt?.x ?? 0),
      y: (box?.y ?? 0) + (pt?.y ?? 0),
    };
  }, lngLat);
  await page.mouse.click(at.x, at.y);
}

test.describe("the base map", () => {
  test("sections are a pale 9px river, the selected one teal 5px on a white 10px casing", async ({
    page,
  }) => {
    await gotoSection(page, "lower");
    await page.waitForFunction(() => window.__paddlemateMap?.loaded());
    expect(await paint(page, "sections-line", "line-color")).toBe("#b5d5ec");
    expect(await paint(page, "sections-line", "line-width")).toBe(9);
    expect(await paint(page, "sections-line-casing", "line-color")).toBe(WHITE);
    expect(await paint(page, "sections-line-selected", "line-color")).toBe(
      TEAL,
    );
    expect(await paint(page, "sections-line-selected", "line-width")).toBe(5);
    expect(
      await paint(page, "sections-line-selected-casing", "line-color"),
    ).toBe(WHITE);
    expect(
      await paint(page, "sections-line-selected-casing", "line-width"),
    ).toBe(10);
  });

  test("put-in and take-out icons carry the section's water level", async ({
    page,
  }) => {
    await page.goto(`/?waterway=${FIX.waterway}`);
    await appReady(page);
    await page.waitForFunction(() => window.__paddlemateMap?.loaded());
    await expect
      .poll(
        async () => {
          const r = await page.evaluate(() => {
            const map = window.__paddlemateMap;
            const data = map?.getSource("section-endpoints")?.serialize().data;
            const levels = new Set(
              (data?.features ?? []).map((f) => f.properties?.level as string),
            );
            const px = (id: string) =>
              Array.from(map?.getImage(id)?.data.data ?? []).join(",");
            return {
              levels: [...levels],
              icons: ["empty", "low", "medium", "high"].map((l) =>
                px(`put-in-icon-${l}`),
              ),
            };
          });
          return (
            r.levels.length > 1 &&
            new Set(r.icons).size === 4 &&
            r.icons.every((i) => i.length > 100)
          );
        },
        { timeout: 15000 },
      )
      .toBe(true);
  });

  test("the base map is calm at every zoom: warm ground, no capitals, no hatching", async ({
    page,
  }) => {
    await gotoSection(page, "lower");
    await page.waitForFunction(() => window.__paddlemateMap?.loaded());
    await page.evaluate(() =>
      window.__paddlemateMap?.jumpTo({ center: [13, 47], zoom: 5 }),
    );
    await expect
      .poll(() => paint(page, "background", "background-color"))
      .toBe("#f3f2ec");
    expect(await layout(page, "label_state", "text-transform")).toBe("none");
    expect(await layout(page, "label_other", "text-transform")).toBe("none");
    expect(await layout(page, "landcover_wetland", "visibility")).toBe("none");
  });

  test("feature labels are 12px bold ink to the right of a small marker, names as written", async ({
    page,
  }) => {
    await gotoSection(page, "lower");
    await page.waitForFunction(() => window.__paddlemateMap?.loaded());
    expect(await layout(page, "feature-points-label", "text-anchor")).toBe(
      "left",
    );
    expect(await layout(page, "feature-points-label", "text-size")).toBe(12);
    expect(await layout(page, "feature-points-label", "text-font")).toEqual([
      "Noto Sans Bold",
    ]);
    // Numbered features get a bigger disc; the rest stay the small 3.5px dot.
    expect(await paint(page, "feature-points-circle", "circle-radius")).toEqual(
      ["case", ["has", "num"], 11, 3.5],
    );
    expect(
      await paint(page, "feature-points-circle", "circle-stroke-color"),
    ).toBe(WHITE);
    const labels = [
      ...(await sourceFeatures(page, "feature-line-labels")),
      ...(await sourceFeatures(page, "feature-points")),
    ].map((f) => f.label ?? "");
    expect(labels.some((l) => /\s[IV]+[-+]?[IV]*\+?$/.test(l))).toBe(true);
    expect(labels.filter((l) => l.includes("("))).toEqual([]);
  });

  test("the compass is absent at north and fades in once the map is rotated", async ({
    page,
    isMobile,
  }) => {
    await gotoControls(page, isMobile);
    await expect(page.locator(".maplibregl-ctrl-compass")).toHaveCount(0);
    await page.waitForFunction(() => window.__paddlemateMap?.loaded());
    // At north the key is aria-hidden, so the role lookup must include hidden.
    const key = page.getByRole("button", {
      name: "Reset bearing to north",
      includeHidden: true,
    });
    await expect(key).toHaveCSS("opacity", "0");
    await expect(key).toHaveCSS("pointer-events", "none");
    await page.evaluate(() => window.__paddlemateMap?.setBearing(40));
    await expect(key).toHaveCSS("opacity", "1");
    await expectTouchTargets(key);
    await key.click();
    await expect(key).toHaveCSS("opacity", "0");
    expect(
      await page.evaluate(() => window.__paddlemateMap?.getBearing()),
    ).toBe(0);
  });

  test("the layers key is one 44px key under the zoom group, nothing floats at the left @small", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "the desktop stack is the canvas's");
    await page.goto("/?mode=region");
    await appReady(page);
    const key = page.getByTestId("map-layer-button");
    await expect(key).toBeVisible();
    await expect(page.getByTestId("map-layer-toggle")).toHaveCount(0);
    const k = await key.boundingBox();
    const zoom = await page
      .locator(".maplibregl-ctrl-group")
      .first()
      .boundingBox();
    expect(k?.width).toBe(44);
    expect(k?.height).toBe(44);
    expect(
      Math.abs((k?.x ?? 0) + 44 - ((zoom?.x ?? 0) + (zoom?.width ?? 0))),
    ).toBeLessThanOrEqual(1);
    expect(k?.y ?? 0).toBeGreaterThanOrEqual(
      (zoom?.y ?? 0) + (zoom?.height ?? 0),
    );
    await key.click();
    const pop = await page.getByTestId("map-layer-toggle").boundingBox();
    expect((pop?.x ?? 0) + (pop?.width ?? 0)).toBeLessThanOrEqual(k?.x ?? 0);
    await expectNoHorizontalOverflow(page);
  });

  test("the small map markers are 44px to hit", async ({ page }) => {
    await page.goto("/logs/9201");
    const markers = page.locator(".maplibregl-marker");
    await expect(markers.first()).toBeAttached();
    expect(await markers.count()).toBeGreaterThan(0);
    await expectTouchTargets(markers);
  });

  test("the controls are white floating groups with 44px buttons, in sentence case", async ({
    page,
    isMobile,
  }) => {
    await gotoControls(page, isMobile);
    const group = page.locator(".maplibregl-ctrl-group").first();
    await expect(group).toBeVisible();
    expect(await computed(group, "background-color")).toBe(
      "rgb(255, 255, 255)",
    );
    expect(await computed(group, "box-shadow")).toBe(E2);
    await expectTouchTargets(
      page.locator(".maplibregl-ctrl-group button:visible"),
    );

    await openLayers(page);
    const toggle = page.getByTestId("map-layer-toggle");
    await expect(toggle).toBeVisible();
    // Measured once the popover has finished scaling in.
    await expect(toggle).toHaveCSS("transform", "none");
    expect(await computed(toggle, "background-color")).toBe(
      "rgb(255, 255, 255)",
    );
    expect(await computed(toggle, "box-shadow")).toBe(E2);
    const buttons = toggle.getByRole("button");
    await expectTouchTargets(buttons);
    expect(await computed(toggle, "border-top-left-radius")).toBe("14px");
    expect(await computed(toggle, "padding-top")).toBe("10px");
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      expect(await computed(buttons.nth(i), "text-transform")).toBe("none");
    }
    await expect(toggle.getByText("Section", { exact: true })).toBeVisible();
    await expect(toggle.getByText("River", { exact: true })).toBeVisible();
    await expect(toggle.getByText("Satellite", { exact: true })).toBeVisible();
  });
});

test.describe("the layer toggle", () => {
  for (const width of [768, 1280]) {
    test(`Section and River share one row at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await gotoSection(page, "lower");
      await openLayers(page);
      const toggle = page.getByTestId("map-layer-toggle");
      const section = await toggle
        .getByRole("button", { name: "Section", exact: true })
        .boundingBox();
      const river = await toggle
        .getByRole("button", { name: "River", exact: true })
        .boundingBox();
      expect(section?.y, "same row").toBe(river?.y);
      expect(section?.height, "one line of text").toBe(44);
      expect(river?.height).toBe(44);
      expect(
        await toggle.boundingBox().then((b) => b?.width ?? 0),
      ).toBeLessThan(320);
      const sat = await toggle
        .getByRole("button", { name: "Satellite", exact: true })
        .boundingBox();
      expect(sat?.y, "Satellite is its own row").toBeGreaterThan(
        (section?.y ?? 0) + 40,
      );
      await toggle.getByRole("button", { name: "River" }).click();
      await expect(
        toggle.getByRole("button", { name: "River" }),
        "the set cell is a white pill",
      ).toHaveAttribute("aria-pressed", "true");
    });
  }
});

test.describe("regions", () => {
  test("every boundary is one solid grey line in one ink", async ({ page }) => {
    await openRegionMap(page);
    const color = await paint(page, "region-browse-line", "line-color");
    expect(typeof color, "one colour, not a per-region expression").toBe(
      "string",
    );
    expect(color).toBe(INK);
    expect(await paint(page, "region-browse-line", "line-dasharray")).toBe(
      undefined,
    );
    expect(await paint(page, "region-browse-line", "line-width")).toBeLessThan(
      2,
    );
  });

  test("a range holding two others and a speck of a district are not drawn", async ({
    page,
  }) => {
    await openRegionMap(page);
    const ids = (await sourceFeatures(page, "region-browse")).map((f) => f.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        REGIONS.alpha.id,
        REGIONS.beta.id,
        REGIONS.inner.id,
        REGIONS.valley.id,
      ]),
    );
    expect(ids).not.toContain(REGIONS.big.id);
    expect(ids).not.toContain(REGIONS.tiny.id);
  });

  test("each region has one label", async ({ page }) => {
    await openRegionMap(page);
    const labels = await sourceFeatures(page, "region-labels");
    const ids = labels.map((l) => l.id);
    expect(new Set(ids).size, "one label per region").toBe(ids.length);
    expect(ids).toContain(REGIONS.alpha.id);
    expect(labels.every((l) => l.geometry === "Point")).toBe(true);
    const alpha = labels.find((l) => l.id === REGIONS.alpha.id);
    expect(alpha?.label, "the name alone, no country prefix").toBe(
      REGIONS.alpha.name,
    );
  });

  test("region names are quieter than the base map's labels", async ({
    page,
  }) => {
    await openRegionMap(page);
    const sizes = JSON.stringify(
      await layout(page, "region-label", "text-size"),
    );
    expect(sizes, "12 for a choice, 13 for the picked one").toBe(
      '["case",["get","picked"],13,12]',
    );
    const size = 12;
    const fonts = JSON.stringify(
      await layout(page, "region-label", "text-font"),
    );
    expect(fonts, "the picked name is bold").toContain("Noto Sans Bold");
    expect(fonts).toContain("Noto Sans Regular");
    const color = JSON.stringify(
      await paint(page, "region-label", "text-color"),
    );
    expect(color).toContain(INK);
    expect(color, "ink and the one teal, nothing else").not.toContain(
      "#1f2b31",
    );
    expect(await paint(page, "region-label", "text-halo-color")).toBe(WHITE);
    const base = await layout(page, "label_town", "text-size");
    expect(JSON.stringify(base)).not.toBe(JSON.stringify(size));
  });

  test("roads and road numbers fade in region mode and come back", async ({
    page,
  }) => {
    await openRegionMap(page);
    await expect
      .poll(() => paint(page, "road_motorway", "line-opacity"))
      .toBeLessThanOrEqual(0.4);
    expect(await layout(page, "highway-shield-non-us", "visibility")).toBe(
      "none",
    );
    expect(await layout(page, "highway-name-major", "visibility")).toBe("none");
    // Leave region mode inside the app, without a reload.
    await page.evaluate(() => {
      window.history.pushState({}, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(page).not.toHaveURL(/mode=region/);
    await expect
      .poll(() => paint(page, "road_motorway", "line-opacity"))
      .toBeGreaterThan(0.4);
    expect(await layout(page, "highway-name-major", "visibility")).toBe(
      "visible",
    );
  });

  test("valleys are soft bands and the country border is one solid line over a casing", async ({
    page,
  }) => {
    await openRegionMap(page);
    expect(
      await paint(page, "region-valley-band", "line-opacity"),
    ).toBeLessThan(0.5);
    expect(await paint(page, "country-border-casing", "line-color")).toBe(
      WHITE,
    );
    expect(
      await paint(page, "country-border-line", "line-dasharray"),
      "solid",
    ).toBe(undefined);
    expect(await paint(page, "country-border-line", "line-width")).toBe(1.4);
    expect(await paint(page, "country-border-line", "line-color")).toBe(
      "#3a454b",
    );
    expect(await paint(page, "country-border-casing", "line-width")).toBe(4);
    expect(await paint(page, "country-border-label", "text-color")).toBe(INK);
  });

  test("the map asks for every level and says which ones are too wide to draw", async ({
    page,
  }) => {
    const asked: string[] = [];
    await mockRegions(page);
    await page.route("**/api/v1/geo/region-outlines*", (route) => {
      asked.push(
        new URL(route.request().url()).searchParams.get("kinds") ?? "",
      );
      return route.fulfill({
        json: {
          countries: [],
          filling: false,
          hidden_kinds: ["district"],
          regions: [REGIONS.alpha],
        },
      });
    });
    await page.goto("/?mode=region");
    await appReady(page);
    await expect(page.getByTestId("region-hidden-note")).toHaveText(
      "Zoom in to see districts",
    );
    expect(asked[0]).toBe("valley,district,range,state");
  });

  test("the cursor says a region is clickable", async ({ page, isMobile }) => {
    test.skip(isMobile, "no hover on a touch screen");
    await openRegionMap(page);
    const at = await page.evaluate((p) => {
      const map = window.__paddlemateMap;
      const box = map?.getCanvas().getBoundingClientRect();
      const pt = map?.project(p);
      return {
        x: (box?.x ?? 0) + (pt?.x ?? 0),
        y: (box?.y ?? 0) + (pt?.y ?? 0),
      };
    }, SOLO_POINT);
    await page.mouse.move(at.x, at.y);
    await page.mouse.move(at.x + 2, at.y + 2);
    await expect
      .poll(() =>
        page.evaluate(() => window.__paddlemateMap?.getCanvas().style.cursor),
      )
      .toBe("pointer");
  });

  test("picking a region turns it teal", async ({ page }) => {
    await openRegionMap(page);
    expect(await sourceFeatures(page, "region-picked")).toHaveLength(0);
    await clickAt(page, SOLO_POINT);
    await expect(page).toHaveURL(new RegExp(`region=${REGIONS.beta.id}`));
    await expect
      .poll(async () => (await sourceFeatures(page, "region-picked")).length)
      .toBe(1);
    expect(await paint(page, "region-picked-line", "line-color")).toBe(TEAL);
    expect(await paint(page, "region-picked-fill", "fill-color")).toBe(TEAL);
    const label = await paint(page, "region-label", "text-color");
    expect(JSON.stringify(label)).toContain(TEAL);
    await expect(page.getByText(/regions here/)).toHaveCount(0);
  });

  test("shared ground picks the innermost and offers the rest as rows", async ({
    page,
  }) => {
    await openRegionMap(page);
    await clickAt(page, SHARED_POINT);
    const card = page.getByTestId("region-choices");
    await expect(card.getByText("2 regions here")).toBeVisible();
    await expect(card.getByText("AT \u00b7 Mountain ranges")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`region=${REGIONS.inner.id}`));
    const rows = card.getByRole("button");
    await expect(rows).toHaveCount(2);
    const heights = await rows.evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().height),
    );
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(48);

    await rows.filter({ hasText: REGIONS.alpha.name }).hover();
    await expect
      .poll(async () =>
        (await sourceFeatures(page, "region-lit")).map((f) => f.id),
      )
      .toEqual([REGIONS.alpha.id]);

    await rows.filter({ hasText: REGIONS.alpha.name }).click();
    await expect(page).toHaveURL(new RegExp(`region=${REGIONS.alpha.id}`));
    await expect(card).toHaveCount(0);
  });

  test("@small the choice card fits a 320px screen", async ({ page }) => {
    await openRegionMap(page);
    // The peek sheet covers the foot of a 320px screen; look further south so
    // the shared ground is above it.
    await page.evaluate(() =>
      window.__paddlemateMap?.jumpTo({ center: [10.2, 46.5], zoom: 7 }),
    );
    await clickAt(page, SHARED_POINT);
    const card = page.getByTestId("region-choices");
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 999)).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? 0,
    );
    await expectNoHorizontalOverflow(page);
  });
});

async function dragSheetOpen(page: Page) {
  const box = await page.getByRole("region", { name: "Search" }).boundingBox();
  const x = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const y = (box?.y ?? 0) + 22;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 150, { steps: 6 });
  await page.mouse.move(x, y - 300, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByRole("dialog", { name: "Search" })).toBeVisible();
}

test.describe("the region sheet", () => {
  test.beforeEach(({ browserName }, info) => {
    void browserName;
    test.skip(info.project.name === "desktop", "the sheet is the phone layout");
  });

  test("levels are chips that narrow the map, and the sheet is the panel", async ({
    page,
  }) => {
    await openRegionMap(page);
    const sheet = page.getByRole("region", { name: "Search" });
    for (const level of ["Valleys", "Districts", "Mountain ranges", "States"]) {
      await expect(
        sheet.getByRole("button", { name: level, exact: true }),
      ).toBeVisible();
    }
    // The sheet is the panel here: there is no separate results button.
    await expect(
      page.getByRole("button", { name: "Open search panel" }),
    ).toHaveCount(0);

    await sheet.getByRole("button", { name: "Districts", exact: true }).click();
    await expect
      .poll(async () =>
        (await sourceFeatures(page, "region-browse")).map((f) => f.id),
      )
      .toEqual([REGIONS.inner.id]);
    await sheet.getByRole("button", { name: "Districts", exact: true }).click();
    await expect
      .poll(async () => (await sourceFeatures(page, "region-browse")).length)
      .toBeGreaterThan(1);
  });

  test("the sheet says how to pick, the map has a 48px search field, and chips are 44px to hit @small", async ({
    page,
  }) => {
    await openRegionMap(page);
    const sheet = page.getByRole("region", { name: "Search" });
    await expect(
      sheet.getByText("Tap a region on the map, or search one by name."),
    ).toBeVisible();
    const field = page.getByRole("textbox", { name: "Search regions" });
    await expect(field).toBeVisible();
    const box = await field
      .locator("xpath=ancestor::div[contains(@class,'MuiInputBase-root')]")
      .boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(48);
    expect(await computed(field, "font-size")).toBe("16px");
    await expectTouchTargets(
      sheet.getByRole("button", { name: "Districts", exact: true }),
    );
    await expectNoHorizontalOverflow(page);
  });

  test("a pick shows what it is part of and the ranges the map left out @small", async ({
    page,
  }) => {
    await openRegionMap(page);
    // Keep the ground above the peek sheet, which covers a short screen's middle.
    await page.evaluate(() =>
      window.__paddlemateMap?.jumpTo({ center: [11.3, 46.5], zoom: 7 }),
    );
    await page.waitForTimeout(1000);
    await clickAt(page, SOLO_POINT);
    await expect(page).toHaveURL(new RegExp(`region=${REGIONS.beta.id}`));
    await dragSheetOpen(page);
    const sheet = page.getByRole("dialog", { name: "Search" });
    // The pick sits in the sheet as a chip with its name and a remove cross.
    await expect(
      sheet.getByText(REGIONS.beta.name, { exact: true }),
    ).toBeVisible();
    await expect(sheet.getByText("Part of")).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: REGIONS.big.name }),
    ).toBeVisible();
    await sheet
      .getByRole("button", { name: "Mountain ranges in view (1)" })
      .click();
    await expect(sheet.getByText(REGIONS.big.name).nth(1)).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await sheet.getByRole("button", { name: REGIONS.big.name }).first().click();
    await expect(page).toHaveURL(new RegExp(`region=${REGIONS.big.id}`));
  });
});

test.describe("the put-in and take-out pins in the log form", () => {
  test("labels are sentence case, fields 16px and 44px, no monospace, verb by device @small", async ({
    page,
  }, info) => {
    await page.goto(
      `/logs/new?waterwayId=${FIX.waterway}&sectionId=${FIX.sections.upper}`,
    );
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText("Step 2 of 3 · Sections")).toBeVisible();
    const field = page.getByLabel("Label (optional)").first();
    await expect(field).toBeVisible();
    expect(await computed(field, "font-size")).toBe("16px");
    const box = await field
      .locator("xpath=ancestor::div[contains(@class,'MuiInputBase-root')]")
      .boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    const clear = page.getByRole("button", { name: "Clear Put in" });
    await expectTouchTargets(clear);
    await clear.click();
    const verb = info.project.name === "desktop" ? "Click" : "Tap";
    const hint = page.getByText(`${verb} the map to set`).first();
    await expect(hint).toBeVisible();
    expect(await computed(hint, "font-family")).not.toMatch(/mono/i);
    const title = page.getByText("Put in", { exact: true }).first();
    expect(await computed(title, "text-transform")).toBe("none");
    expect(await computed(title, "letter-spacing")).toBe("normal");
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("embedded maps", () => {
  test("a log's map shows only the route: no layer card, teal numbered markers, a rounded card", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/logs/9201");
    await expect(
      page.locator("canvas.maplibregl-canvas").first(),
    ).toBeAttached();
    await expect(page.getByTestId("map-layer-toggle")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible();
    // On the desktop canvas the map runs edge to edge; the rounded card is the phone's.
    if (isMobile) {
      const framed = await page
        .locator("canvas.maplibregl-canvas")
        .first()
        .evaluate((el) => {
          for (let n = el.parentElement; n; n = n.parentElement) {
            const css = getComputedStyle(n);
            if (css.borderTopLeftRadius === "14px")
              return css.boxShadow !== "none";
          }
          return null;
        });
      expect(framed, "a 14px card with a shadow").toBe(true);
    }
    const marks = page
      .locator(".maplibregl-marker div div")
      .filter({ hasText: /^[12]$/ });
    const n = await marks.count();
    for (let i = 0; i < n; i++) {
      expect(await computed(marks.nth(i), "background-color")).toBe(
        "rgb(14, 116, 144)",
      );
    }
  });

  test("a wizard's map has no layer card either", async ({ page }) => {
    await page.goto(`/waterways/suggest-section?waterway=${FIX.waterway}`);
    await page.getByLabel("Name").first().fill("Embedded Spec");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText("Step 2 of 3 · Section")).toBeVisible();
    await expect(
      page.locator("canvas.maplibregl-canvas").first(),
    ).toBeAttached();
    await expect(page.getByTestId("map-layer-toggle")).toHaveCount(0);
  });
});
