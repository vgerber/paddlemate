import { expect, type Page, test } from "@playwright/test";
import { appReady, expectNoHorizontalOverflow } from "../support/fixture";
import {
  mockRegions,
  REGIONS,
  SHARED_POINT,
  SOLO_POINT,
  VALLEY_POINT,
} from "./regions.mock";

// Region mode: one kind at a time, a tap that previews on a phone, valleys
// that can be hit, and a list that matches what the map shows.

type LngLat = [number, number];
type MapLike = {
  jumpTo(o: { center: LngLat; zoom: number }): void;
  project(p: LngLat): { x: number; y: number };
  getCanvas(): HTMLCanvasElement;
  getSource(id: string): {
    serialize(): {
      data?: { features: { properties?: { id?: number } | null }[] };
    };
  };
  queryRenderedFeatures(at: unknown, o: { layers: string[] }): unknown[];
};

async function open(page: Page, center: LngLat, zoom: number) {
  await mockRegions(page);
  await page.goto("/?mode=region");
  await appReady(page);
  await page.waitForFunction(
    () => (window as unknown as { __paddlemateMap?: MapLike }).__paddlemateMap,
  );
  await page.evaluate(
    ([c, z]) =>
      (
        window as unknown as { __paddlemateMap: MapLike }
      ).__paddlemateMap.jumpTo({ center: c as LngLat, zoom: z as number }),
    [center, zoom] as const,
  );
}

const segment = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true }).filter({ visible: true });

const drawnIds = (page: Page) =>
  page.evaluate(() =>
    (
      (window as unknown as { __paddlemateMap: MapLike }).__paddlemateMap
        .getSource("region-browse")
        .serialize().data?.features ?? []
    ).map((f) => f.properties?.id as number),
  );

const litIds = (page: Page) =>
  page.evaluate(() =>
    (
      (window as unknown as { __paddlemateMap: MapLike }).__paddlemateMap
        .getSource("region-lit")
        .serialize().data?.features ?? []
    ).map((f) => f.properties?.id as number),
  );

/** Screen position of a map point, offset by whole pixels. */
async function screenAt(page: Page, p: LngLat, dx = 0, dy = 0) {
  return page.evaluate(
    ([pt, ox, oy]) => {
      const m = (window as unknown as { __paddlemateMap: MapLike })
        .__paddlemateMap;
      const box = m.getCanvas().getBoundingClientRect();
      const q = m.project(pt as LngLat);
      return {
        x: box.x + q.x + (ox as number),
        y: box.y + q.y + (oy as number),
      };
    },
    [p, dx, dy] as const,
  );
}

async function tap(page: Page, p: LngLat, dx = 0, dy = 0) {
  await expect
    .poll(() =>
      page.evaluate(
        ([pt, ox, oy]) => {
          const m = (window as unknown as { __paddlemateMap: MapLike })
            .__paddlemateMap;
          const q = m.project(pt as LngLat);
          return m.queryRenderedFeatures(
            [q.x + (ox as number), q.y + (oy as number)],
            { layers: ["region-browse-fill"] },
          ).length;
        },
        [p, dx, dy] as const,
      ),
    )
    .toBeGreaterThan(0);
  const at = await screenAt(page, p, dx, dy);
  await page.mouse.click(at.x, at.y);
}

const onPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;

test.describe("region kinds", () => {
  test("the map draws one kind at a time and the control says which", async ({
    page,
  }) => {
    await open(page, [10.9, 46.8], 7);
    await segment(page, "Ranges").click();
    await expect(segment(page, "Ranges")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(segment(page, "Districts")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect
      .poll(() => drawnIds(page))
      .toEqual(expect.arrayContaining([REGIONS.alpha.id, REGIONS.beta.id]));
    expect(await drawnIds(page)).not.toContain(REGIONS.inner.id);
    await segment(page, "Districts").click();
    await expect.poll(() => drawnIds(page)).toEqual([REGIONS.inner.id]);
  });

  test("until one is chosen the kind follows the zoom, and tapping it again unpins", async ({
    page,
  }) => {
    await open(page, [10.9, 46.8], 4);
    await expect(segment(page, "States")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.evaluate(() =>
      (
        window as unknown as { __paddlemateMap: MapLike }
      ).__paddlemateMap.jumpTo({ center: [10.9, 46.8], zoom: 12 }),
    );
    await expect(segment(page, "Valleys")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await segment(page, "Ranges").click();
    await page.evaluate(() =>
      (
        window as unknown as { __paddlemateMap: MapLike }
      ).__paddlemateMap.jumpTo({ center: [10.9, 46.8], zoom: 4 }),
    );
    await expect(segment(page, "Ranges")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await segment(page, "Ranges").click();
    await expect(segment(page, "States")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("all four segments fit the panel and are 44px tall @small", async ({
    page,
  }) => {
    await open(page, [10.9, 46.8], 7);
    const width = page.viewportSize()?.width ?? 0;
    for (const name of ["Valleys", "Districts", "Ranges", "States"]) {
      const box = await segment(page, name).boundingBox();
      expect(box?.height, name).toBeGreaterThanOrEqual(44);
      expect(box?.x ?? -1, name).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0), name).toBeLessThanOrEqual(
        width,
      );
    }
    await expectNoHorizontalOverflow(page);
  });

  test("a pick keeps its kind on after the map fits to it", async ({
    page,
  }) => {
    // The fit on a wide window stays in the district band; only a phone's
    // narrow view drops to valleys, so only there the pin shows.
    test.skip(!onPhone(page), "the fit leaves the band only on a phone");
    // No chip chosen: the kind follows the zoom (districts here).
    await open(page, [10.45, 46.9], 8);
    await expect.poll(() => drawnIds(page)).toContain(REGIONS.inner.id);
    const asked: string[] = [];
    page.on("request", (req) => {
      const url = new URL(req.url());
      if (url.pathname.endsWith("/geo/region-outlines"))
        asked.push(url.searchParams.get("kinds") ?? "");
    });
    await tap(page, SHARED_POINT);
    if (onPhone(page)) await tap(page, SHARED_POINT);
    await expect(page).toHaveURL(new RegExp(`region=${REGIONS.inner.id}`));
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as unknown as { __paddlemateMap: { getZoom(): number } }
          ).__paddlemateMap.getZoom(),
        ),
      )
      .toBeGreaterThan(8.5);
    // The map fitted to the pick, which on the zoom alone would now draw
    // valleys; the districts stay.
    await expect.poll(() => asked.length).toBeGreaterThan(0);
    expect(new Set(asked)).toEqual(new Set(["district"]));
  });
});

test.describe("tapping a region", () => {
  test("a valley can be picked, also from beside its narrow corridor", async ({
    page,
  }) => {
    await open(page, [11.1, 46.2], 7);
    await segment(page, "Valleys").click();
    await tap(page, VALLEY_POINT, 0, 0);
    if (onPhone(page)) await tap(page, VALLEY_POINT, 0, 0);
    await expect(page).toHaveURL(new RegExp(`region=${REGIONS.valley.id}`));
  });

  test("a tap a few pixels off a valley still finds it", async ({ page }) => {
    await open(page, [11.1, 46.2], 7);
    await segment(page, "Valleys").click();
    await expect
      .poll(() =>
        page.evaluate((p) => {
          const m = (window as unknown as { __paddlemateMap: MapLike })
            .__paddlemateMap;
          return m.queryRenderedFeatures(m.project(p), {
            layers: ["region-browse-fill"],
          }).length;
        }, VALLEY_POINT),
      )
      .toBeGreaterThan(0);
    // The corridor is drawn; tap beside it.
    const at = await screenAt(page, VALLEY_POINT, 0, 7);
    await page.mouse.click(at.x, at.y);
    if (onPhone(page)) await page.mouse.click(at.x, at.y);
    await expect(page).toHaveURL(new RegExp(`region=${REGIONS.valley.id}`));
  });

  test("a phone lights the region and offers Pick; a second tap or Pick picks", async ({
    page,
  }) => {
    test.skip(!onPhone(page), "the preview is the phone's");
    await open(page, [11.6, 46.5], 7);
    await segment(page, "Ranges").click();
    await tap(page, SOLO_POINT);
    await expect(page).not.toHaveURL(/region=/);
    expect(await litIds(page)).toEqual([REGIONS.beta.id]);
    const strip = page.getByTestId("region-preview").filter({ visible: true });
    await expect(strip).toContainText(REGIONS.beta.name);
    await expect(strip).toContainText("Mountain range");
    const pick = strip.getByRole("button", { name: "Pick" });
    const box = await pick.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
      page.viewportSize()?.height ?? 0,
    );
    await expectNoHorizontalOverflow(page);
    await pick.click();
    await expect(page).toHaveURL(new RegExp(`region=${REGIONS.beta.id}`));
    await expect.poll(() => litIds(page)).toEqual([]);
  });

  test("a phone's tap on bare map clears the preview", async ({ page }) => {
    test.skip(!onPhone(page), "the preview is the phone's");
    await open(page, [11.6, 46.5], 7);
    await segment(page, "Ranges").click();
    await tap(page, SOLO_POINT);
    expect(await litIds(page)).toHaveLength(1);
    // East of every mocked range.
    const at = await screenAt(page, [12.6, 47.2]);
    await page.mouse.click(at.x, at.y);
    await expect.poll(() => litIds(page)).toEqual([]);
    await expect(page.getByTestId("region-preview")).toHaveCount(0);
  });

  test("a desktop picks on one click and names the region under the pointer", async ({
    page,
  }) => {
    test.skip(onPhone(page), "hover and a direct pick are the desktop's");
    await open(page, [10.9, 46.8], 7);
    await segment(page, "Ranges").click();
    await expect
      .poll(() =>
        page.evaluate((p) => {
          const m = (window as unknown as { __paddlemateMap: MapLike })
            .__paddlemateMap;
          return m.queryRenderedFeatures(m.project(p), {
            layers: ["region-browse-fill"],
          }).length;
        }, SOLO_POINT),
      )
      .toBeGreaterThan(0);
    const at = await screenAt(page, SOLO_POINT);
    await page.mouse.move(at.x, at.y);
    await page.mouse.move(at.x + 2, at.y + 2);
    const tag = page.getByTestId("region-hover-tag");
    await expect(tag).toContainText(REGIONS.beta.name);
    await expect(tag).toContainText("Mountain range");
    expect(await litIds(page)).toEqual([REGIONS.beta.id]);
    await page.mouse.click(at.x + 2, at.y + 2);
    await expect(page).toHaveURL(new RegExp(`region=${REGIONS.beta.id}`));
  });

  test("shared ground of one kind picks the smaller region", async ({
    page,
  }) => {
    test.skip(onPhone(page), "a phone previews and has no choice card");
    await open(page, [10.45, 46.5], 7);
    await segment(page, "Ranges").click();
    await tap(page, SHARED_POINT);
    await expect(page).toHaveURL(new RegExp(`region=${REGIONS.nested.id}`));
  });
});

test.describe("the list matches the view", () => {
  test("it counts the ranges in view, the ones the map thins out included", async ({
    page,
  }) => {
    // Narrow enough that Beta range is out of view.
    await open(page, [10.4, 46.9], 10);
    await segment(page, "Ranges").click();
    await expect
      .poll(() => drawnIds(page))
      .toEqual(expect.arrayContaining([REGIONS.alpha.id]));
    await expect(
      page.getByTestId("region-list-toggle").filter({ visible: true }),
    ).toHaveText("Mountain ranges in view (3)");
  });

  test("panning to other ground changes the list", async ({ page }) => {
    await open(page, [10.4, 46.9], 10);
    await segment(page, "Ranges").click();
    const toggle = page
      .getByTestId("region-list-toggle")
      .filter({ visible: true });
    await expect(toggle).toHaveText("Mountain ranges in view (3)");
    await page.evaluate(() =>
      (
        window as unknown as { __paddlemateMap: MapLike }
      ).__paddlemateMap.jumpTo({ center: [11.6, 46.9], zoom: 10 }),
    );
    await expect(toggle).toHaveText("Mountain ranges in view (2)");
  });
});
