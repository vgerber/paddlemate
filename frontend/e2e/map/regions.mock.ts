import type { Page } from "@playwright/test";

/** Where the mocked regions sit: the test puts the camera here. */
export const VIEW = { center: [10.9, 46.9] as [number, number], zoom: 7 };

type Ring = [number, number][];

function rect(w: number, s: number, e: number, n: number): Ring[] {
  return [
    [
      [w, s],
      [e, s],
      [e, n],
      [w, n],
      [w, s],
    ],
  ];
}

function area(
  id: number,
  name: string,
  kind: string,
  w: number,
  s: number,
  e: number,
  n: number,
) {
  return {
    id,
    name,
    kind,
    country: "AT",
    palette_index: id % 6,
    bbox: [w, s, e, n],
    geometry: { type: "Polygon", coordinates: rect(w, s, e, n) },
  };
}

export const REGIONS = {
  big: area(990001, "Grand range", "range", 9.6, 46.2, 12.4, 47.6),
  alpha: area(990002, "Alpha range", "range", 10.0, 46.6, 10.9, 47.2),
  beta: area(990003, "Beta range", "range", 11.2, 46.6, 12.0, 47.2),
  inner: area(990004, "Inner district", "district", 10.2, 46.75, 10.7, 47.05),
  tiny: area(990005, "Tiny district", "district", 10.9, 47.3, 11.0, 47.4),
  valley: {
    id: 990006,
    name: "Long valley",
    kind: "valley",
    country: "AT",
    palette_index: 0,
    bbox: [10.0, 46.3, 12.2, 46.5],
    geometry: {
      type: "LineString",
      coordinates: [
        [10.0, 46.3],
        [11.1, 46.5],
        [12.2, 46.4],
      ],
    },
  },
};

/** Ground held by both the alpha range and the inner district. */
export const SHARED_POINT: [number, number] = [10.45, 46.9];
/** Ground held by the beta range only. */
export const SOLO_POINT: [number, number] = [11.6, 46.9];

const COUNTRY = {
  country: "AT",
  name: "Austria",
  neighbours: ["DE", "IT"],
  geometry: {
    type: "LineString",
    coordinates: [
      [9.0, 47.7],
      [13.0, 47.8],
    ],
  },
};

/** Serve a fixed set of regions for every viewport, so the checks do not
 * depend on what the database happens to hold. */
export async function mockRegions(page: Page) {
  const all = Object.values(REGIONS);
  await page.route("**/api/v1/geo/region-outlines*", (route) =>
    route.fulfill({
      json: { countries: [COUNTRY], filling: false, regions: all },
    }),
  );
  await page.route(/\/api\/v1\/geo\/regions\/99000\d/, (route) => {
    const id = Number(route.request().url().split("/").pop()?.split("?")[0]);
    const region = all.find((r) => r.id === id);
    return region
      ? route.fulfill({ json: region })
      : route.fulfill({ status: 404, json: {} });
  });
}
