import { describe, expect, test } from "bun:test";
import {
  axisTicks,
  clampLabelX,
  clampReadoutX,
  insetExtent,
  spreadWords,
  tickLabel,
} from "./railGeometry";

const at = (y: number, m: number, d: number, h = 0) =>
  new Date(y, m, d, h).getTime();

describe("insetExtent", () => {
  test("the data end lands the inset short of the plot's right edge", () => {
    const [from, to] = [0, 1000];
    const [, end] = insetExtent([from, to], 508, 8);
    // 500 px carry the data, 8 px the room.
    expect(((to - from) / (end - from)) * 508).toBeCloseTo(500, 5);
  });
  test("a plot narrower than the inset is left alone", () => {
    expect(insetExtent([0, 10], 6, 8)).toEqual([0, 10]);
  });
});

describe("axisTicks", () => {
  test("24h ticks every six hours from midnight", () => {
    const ticks = axisTicks("24h", [at(2026, 9, 11, 17), at(2026, 9, 12, 17)]);
    expect(ticks).toEqual([
      at(2026, 9, 11, 18),
      at(2026, 9, 12, 0),
      at(2026, 9, 12, 6),
      at(2026, 9, 12, 12),
    ]);
  });
  test("7d ticks every second midnight, 30d every fifth", () => {
    const to = at(2026, 9, 12, 16);
    const week = axisTicks("7d", [at(2026, 9, 5, 16), to]);
    expect(week.map((t) => new Date(t).getDate())).toEqual([6, 8, 10, 12]);
    const month = axisTicks("1m", [at(2026, 8, 12, 16), to]);
    expect(month.map((t) => new Date(t).getDate())).toEqual([
      13, 18, 23, 28, 3, 8,
    ]);
  });
  test("1y ticks every second month start", () => {
    const ticks = axisTicks("1y", [at(2025, 9, 12), at(2026, 9, 12)]);
    expect(ticks.map((t) => new Date(t).getMonth())).toEqual([
      10, 0, 2, 4, 6, 8,
    ]);
  });
});

describe("tickLabel", () => {
  test("January carries the year on the year axis only", () => {
    expect(tickLabel("1y", at(2026, 0, 1))).toContain("2026");
    expect(tickLabel("1y", at(2026, 2, 1))).not.toContain("2026");
    expect(tickLabel("7d", at(2026, 0, 1))).not.toContain("2026");
  });
});

describe("clampLabelX", () => {
  test("keeps first and last label 12px inside the edges", () => {
    expect(clampLabelX(0, 40, 600)).toBe(32);
    expect(clampLabelX(600, 40, 600)).toBe(568);
    expect(clampLabelX(300, 40, 600)).toBe(300);
  });
});

describe("spreadWords", () => {
  test("words sit 5px above their lines", () => {
    expect(spreadWords([100, 200])).toEqual([95, 195]);
  });
  test("close neighbours are pushed apart to 13px, in the order given", () => {
    const out = spreadWords([100, 104, 106]);
    expect(out).toEqual([95, 108, 121]);
    expect(spreadWords([106, 100])).toEqual([108, 95]);
  });
});

describe("clampReadoutX", () => {
  test("stays inside the plot by half its width plus 8", () => {
    expect(clampReadoutX(2, 40, 400)).toBe(48);
    expect(clampReadoutX(399, 40, 400)).toBe(352);
  });
});
