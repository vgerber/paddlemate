import { describe, expect, test } from "bun:test";
import type { Descent } from "@/lib/api";
import {
  buildLogsScene,
  ghostSections,
  logsSubject,
  routeCoords,
} from "./logsScene";

const log = (
  id: number,
  sections: { id: number; order: number; coords: number[][] }[],
  extra: Partial<Descent> = {},
) =>
  ({
    id,
    sections: sections.map((s) => ({
      section_id: s.id,
      sort_order: s.order,
      location: { type: "LineString", coordinates: s.coords },
    })),
    ...extra,
  }) as unknown as Descent;

const first = log(
  1,
  [
    {
      id: 11,
      order: 2,
      coords: [
        [11, 48],
        [12, 49],
      ],
    },
    {
      id: 10,
      order: 1,
      coords: [
        [10, 47],
        [11, 48],
      ],
    },
  ],
  { put_in_lat: 46.5, put_in_lon: 9.5, take_out_lat: 49, take_out_lon: 12 },
);
const second = log(2, [
  {
    id: 10,
    order: 1,
    coords: [
      [10, 47],
      [11, 48],
    ],
  },
  {
    id: 20,
    order: 2,
    coords: [
      [5, 40],
      [6, 41],
    ],
  },
]);

describe("routeCoords", () => {
  test("joins the sections in paddled order", () => {
    expect(routeCoords(first)).toEqual([
      [10, 47],
      [11, 48],
      [11, 48],
      [12, 49],
    ]);
  });
});

describe("ghostSections", () => {
  test("lists each section once", () => {
    expect(ghostSections([first, second]).map((s) => s.id)).toEqual([
      11, 10, 20,
    ]);
  });

  test("leaves out the open log's own sections", () => {
    expect(ghostSections([first, second], first).map((s) => s.id)).toEqual([
      20,
    ]);
  });
});

describe("logsSubject", () => {
  test("the open log includes its put-in and take-out", () => {
    expect(logsSubject(first, [first, second])).toEqual({
      key: "log:1",
      bounds: [
        [9.5, 46.5],
        [12, 49],
      ],
    });
  });

  test("without an open log it frames every log", () => {
    const subject = logsSubject(undefined, [first, second]);
    expect(subject?.key).toBe("logs:1,2");
    expect(subject?.bounds).toEqual([
      [5, 40],
      [12, 49],
    ]);
  });

  test("frames nothing while an opened log is loading, or with no logs", () => {
    expect(logsSubject(undefined, [first], 7)).toBeNull();
    expect(logsSubject(undefined, [])).toBeNull();
  });
});

describe("buildLogsScene", () => {
  test("draws the open log as the route and the rest as sections", () => {
    const scene = buildLogsScene(first, [first, second], 1);
    expect(scene.drawing?.sectionPreviewCoords).toHaveLength(4);
    expect(scene.sections?.map((s) => s.id)).toEqual([20]);
    expect(scene.picking?.putIn).toEqual({ lat: 46.5, lon: 9.5 });
    expect(scene.picking?.takeOut).toEqual({ lat: 49, lon: 12 });
  });

  test("without an open log nothing is highlighted", () => {
    const scene = buildLogsScene(undefined, [first, second]);
    expect(scene.drawing?.sectionPreviewCoords).toBeUndefined();
    expect(scene.picking?.putIn).toBeNull();
  });
});
