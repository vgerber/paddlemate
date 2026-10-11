import { expect, type Page, test } from "@playwright/test";
import {
  appReady,
  computed,
  expectNoHorizontalOverflow,
  expectTouchTargets,
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
  project(lngLat: [number, number]): { x: number; y: number };
  jumpTo(o: { center: [number, number]; zoom: number }): void;
  getCanvas(): HTMLCanvasElement;
  loaded(): boolean;
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
  test("sections are a clear blue with a white casing, the selected one teal", async ({
    page,
  }) => {
    await gotoSection(page, "lower");
    await page.waitForFunction(() => window.__paddlemateMap?.loaded());
    expect(await paint(page, "sections-line", "line-color")).toBe("#2b88c8");
    expect(await paint(page, "sections-line-casing", "line-color")).toBe(WHITE);
    expect(await paint(page, "sections-line-selected", "line-color")).toBe(
      TEAL,
    );
  });

  test("the controls are white floating groups with 44px buttons, in sentence case", async ({
    page,
  }) => {
    await gotoSection(page, "lower");
    const group = page.locator(".maplibregl-ctrl-group").first();
    await expect(group).toBeVisible();
    expect(await computed(group, "background-color")).toBe(
      "rgb(255, 255, 255)",
    );
    expect(await computed(group, "box-shadow")).toBe(E2);
    await expectTouchTargets(
      page.locator(".maplibregl-ctrl-group button:visible"),
    );

    const toggle = page.getByTestId("map-layer-toggle");
    await expect(toggle).toBeVisible();
    expect(await computed(toggle, "background-color")).toBe(
      "rgb(255, 255, 255)",
    );
    expect(await computed(toggle, "box-shadow")).toBe(E2);
    const buttons = toggle.getByRole("button");
    await expectTouchTargets(buttons);
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
      ).toBeLessThan(200);
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
    const size = (await layout(page, "region-label", "text-size")) as number;
    expect(size).toBeLessThanOrEqual(12);
    expect(await layout(page, "region-label", "text-font")).toEqual([
      "Noto Sans Regular",
    ]);
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

  test("valleys are soft bands and the country border is dash-dot over a casing", async ({
    page,
  }) => {
    await openRegionMap(page);
    expect(
      await paint(page, "region-valley-band", "line-opacity"),
    ).toBeLessThan(0.5);
    expect(await paint(page, "country-border-casing", "line-color")).toBe(
      WHITE,
    );
    const dash = (await paint(page, "country-border-line", "line-dasharray")) as
      | number[]
      | undefined;
    expect(dash?.length, "dash-dot has four lengths").toBe(4);
    expect(await paint(page, "country-border-label", "text-color")).toBe(INK);
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
  const box = await page.getByRole("region", { name: "Regions" }).boundingBox();
  const x = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const y = (box?.y ?? 0) + 22;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 150, { steps: 6 });
  await page.mouse.move(x, y - 300, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByRole("dialog", { name: "Regions" })).toBeVisible();
}

test.describe("the region sheet", () => {
  test.beforeEach(({ browserName }, info) => {
    void browserName;
    test.skip(info.project.name === "desktop", "the sheet is the phone layout");
  });

  test("levels are chips that narrow the map, and the results button is named", async ({
    page,
  }) => {
    await openRegionMap(page);
    const sheet = page.getByRole("region", { name: "Regions" });
    for (const level of ["Valleys", "Districts", "Mountain ranges", "States"]) {
      await expect(
        sheet.getByRole("button", { name: level, exact: true }),
      ).toBeVisible();
    }
    const results = page.getByRole("button", { name: "Open search panel" });
    await expect(results).toBeVisible();
    await expectTouchTargets(results);

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

  test("a pick shows what it is part of and the ranges the map left out @small", async ({
    page,
  }) => {
    await openRegionMap(page);
    await clickAt(page, SOLO_POINT);
    await expect(
      page
        .getByRole("region", { name: "Regions" })
        .getByText("AT \u00b7 Beta range"),
    ).toBeVisible();
    await dragSheetOpen(page);
    const sheet = page.getByRole("dialog", { name: "Regions" });
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
