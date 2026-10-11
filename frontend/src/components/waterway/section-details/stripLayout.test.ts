import { describe, expect, test } from "bun:test";
import {
  DEFAULT_STRIP,
  layoutStrip,
  type StripPoint,
  stripX,
  worstHazard,
} from "./stripLayout";

const TOTAL = 1000;
const W = 300;
const pt = (
  id: number,
  type: StripPoint["type"],
  distM: number,
): StripPoint => ({
  id,
  type,
  distM,
});

describe("stripX", () => {
  test("keeps the end discs inside the width", () => {
    expect(stripX(0, TOTAL, W)).toBe(DEFAULT_STRIP.disc / 2 + 1);
    expect(stripX(TOTAL, TOTAL, W)).toBe(W - DEFAULT_STRIP.disc / 2 - 1);
  });

  test("clamps outside the run and survives an empty run", () => {
    expect(stripX(-5, TOTAL, W)).toBe(stripX(0, TOTAL, W));
    expect(stripX(2 * TOTAL, TOTAL, W)).toBe(stripX(TOTAL, TOTAL, W));
    expect(stripX(10, 0, W)).toBe(DEFAULT_STRIP.disc / 2 + 1);
  });
});

describe("worstHazard", () => {
  test("ranks siphon, strainer, waterfall, dam, weir, hole", () => {
    expect(worstHazard(["hole", "weir", "siphon"])).toBe("siphon");
    expect(worstHazard(["hole", "weir", "strainer"])).toBe("strainer");
    expect(worstHazard(["hole", "dam", "waterfall"])).toBe("waterfall");
    expect(worstHazard(["hole", "weir", "dam"])).toBe("dam");
    expect(worstHazard(["hole", "weir"])).toBe("weir");
    expect(worstHazard(["hole"])).toBe("hole");
  });

  test("is null without a hazard", () => {
    expect(worstHazard(["bridge", "rapid"])).toBeNull();
  });
});

describe("layoutStrip", () => {
  test("features far apart stay on the line", () => {
    const { discs, groups } = layoutStrip(
      [pt(1, "weir", 200), pt(2, "bridge", 600)],
      TOTAL,
      W,
    );
    expect(groups).toEqual([]);
    expect(discs.map((d) => d.level)).toEqual([0, 0]);
  });

  test("two that overlap step apart, the second below the line", () => {
    const { discs, groups } = layoutStrip(
      [pt(1, "weir", 500), pt(2, "strainer", 520)],
      TOTAL,
      W,
    );
    expect(groups).toEqual([]);
    expect(discs.map((d) => [d.id, d.level])).toEqual([
      [1, 0],
      [2, 1],
    ]);
  });

  test("three that overlap merge into one group with the worst hazard", () => {
    const { discs, groups } = layoutStrip(
      [pt(1, "hole", 500), pt(2, "strainer", 510), pt(3, "weir", 520)],
      TOTAL,
      W,
    );
    expect(discs).toEqual([]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      ids: [1, 2, 3],
      hazard: "strainer",
      count: 3,
    });
  });

  test("a group without a hazard shows the count only", () => {
    const { groups } = layoutStrip(
      [pt(1, "bridge", 500), pt(2, "bridge", 505), pt(3, "bridge", 510)],
      TOTAL,
      W,
    );
    expect(groups[0].hazard).toBeNull();
    expect(groups[0].count).toBe(3);
  });

  test("a wider strip splits the group", () => {
    const points = [
      pt(1, "hole", 500),
      pt(2, "strainer", 530),
      pt(3, "weir", 560),
    ];
    expect(layoutStrip(points, TOTAL, 300).groups).toHaveLength(1);
    const wide = layoutStrip(points, TOTAL, 1200);
    expect(wide.groups).toEqual([]);
    expect(wide.discs).toHaveLength(3);
  });

  test("put in and take out never merge or step into a group", () => {
    const { discs, groups } = layoutStrip(
      [
        pt(1, "put_in", 0),
        pt(2, "hole", 5),
        pt(3, "weir", 10),
        pt(4, "bridge", 15),
        pt(5, "take_out", TOTAL),
      ],
      TOTAL,
      W,
    );
    expect(discs.filter((d) => d.type === "put_in")).toHaveLength(1);
    expect(discs.filter((d) => d.type === "take_out")).toHaveLength(1);
    expect(groups[0].ids).toEqual([2, 3, 4]);
  });

  test("a feature on top of the put in steps below it", () => {
    const { discs } = layoutStrip(
      [pt(1, "put_in", 0), pt(2, "hole", 10)],
      TOTAL,
      W,
    );
    expect(discs.find((d) => d.id === 2)?.level).toBe(1);
    expect(discs.find((d) => d.id === 1)?.level).toBe(0);
  });
});
