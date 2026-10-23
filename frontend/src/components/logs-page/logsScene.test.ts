import { describe, expect, test } from "bun:test";
import type { Descent } from "@/lib/api";
import {
  buildLogsScene,
  logSections,
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

describe("logSections", () => {
  test("lists each section once", () => {
    expect(logSections([first, second]).map((s) => s.id)).toEqual([11, 10, 20]);
  });
});

describe("logsSubject", () => {
  test("the open log includes its put-in and take-out", () => {
    const subject = logsSubject(first, [first, second]);
    expect(subject?.key).toBe("log:1");
    // The box 9.5..12 by 46.5..49 plus 12% room on each side.
    const [[west, south], [east, north]] = subject?.bounds ?? [
      [0, 0],
      [0, 0],
    ];
    expect([west, south, east, north].map((n) => Number(n.toFixed(2)))).toEqual(
      [9.2, 46.2, 12.3, 49.3],
    );
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
  test("highlights the open log's sections and ghosts the rest", () => {
    const scene = buildLogsScene(first, [first, second], 1);
    expect(scene.sections?.map((s) => s.id)).toEqual([11, 10, 20]);
    expect(scene.drawing?.sectionStates).toEqual({
      highlighted: [11, 10],
      ghost: [20],
    });
    expect(scene.drawing?.sectionPreviewCoords).toBeUndefined();
    expect(scene.picking?.putIn).toEqual({ lat: 46.5, lon: 9.5 });
    expect(scene.picking?.takeOut).toEqual({ lat: 49, lon: 12 });
  });

  test("without an open log nothing is highlighted", () => {
    const scene = buildLogsScene(undefined, [first, second]);
    expect(scene.drawing?.sectionStates?.highlighted).toBeUndefined();
    expect(scene.drawing?.sectionStates?.ghost).toEqual([11, 10, 20]);
    expect(scene.picking?.putIn).toBeNull();
  });
});
