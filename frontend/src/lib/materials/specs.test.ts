import { describe, expect, test } from "bun:test";
import { IMPERIAL, METRIC } from "@/lib/prefs/units";
import {
  disciplineLabel,
  disciplinesFor,
  formatSpec,
  MATERIAL_SPECS,
} from "./specs";

describe("formatSpec", () => {
  const weight = MATERIAL_SPECS.find((spec) => spec.key === "weight_kg");
  if (!weight) throw new Error("weight is a spec");

  test("appends the unit and trims trailing zeros", () => {
    expect(formatSpec(22, weight, METRIC)).toBe("22 kg");
    expect(formatSpec(20.5, weight, METRIC)).toBe("20.5 kg");
  });

  test("converts to the chosen units", () => {
    expect(formatSpec(22, weight, IMPERIAL)).toBe("48.5 lb");
  });

  test("shows a dash for a measurement nobody stated", () => {
    expect(formatSpec(undefined, weight, METRIC)).toBe("-");
  });
});

describe("disciplinesFor", () => {
  test("paddles are grouped by use, boats by kind", () => {
    expect(disciplinesFor("paddle")).toEqual([
      "whitewater",
      "freestyle",
      "slalom",
      "wildwater",
      "touring",
      "canoe",
      "polo",
      "other",
    ]);
    for (const boatOnly of ["creek", "river_runner", "playboat", "downriver"]) {
      expect(disciplinesFor("paddle")).not.toContain(boatOnly);
    }
    for (const paddleOnly of ["whitewater", "wildwater", "canoe", "polo"]) {
      for (const category of ["kayak", "canoe", "packraft", "sup"] as const) {
        expect(disciplinesFor(category)).not.toContain(paddleOnly);
      }
    }
    expect(disciplinesFor("kayak")).toContain("creek");
    expect(disciplinesFor("kayak")).not.toContain("freestyle");
  });

  test("with no category every class is offered once", () => {
    const all = disciplinesFor(undefined);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toContain("polo");
    expect(all).toContain("playboat");
  });
});

describe("disciplineLabel", () => {
  test("a paddle's touring class covers sea; a kayak's does not", () => {
    expect(disciplineLabel("touring", "paddle")).toBe("Touring and sea");
    expect(disciplineLabel("touring", "kayak")).toBe("Touring");
    expect(disciplineLabel("whitewater", "paddle")).toBe("Whitewater");
    expect(disciplineLabel("river_runner", "kayak")).toBe("River runner");
    expect(disciplineLabel("polo", "paddle")).toBe("Polo");
  });
});
