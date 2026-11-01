import { describe, expect, test } from "bun:test";
import { IMPERIAL, METRIC } from "@/lib/prefs/units";
import { disciplinesFor, formatSpec, MATERIAL_SPECS } from "./specs";

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
  test("paddles offer paddle disciplines, kayaks no freestyle", () => {
    expect(disciplinesFor("paddle")).toContain("freestyle");
    expect(disciplinesFor("paddle")).not.toContain("playboat");
    expect(disciplinesFor("kayak")).toContain("playboat");
    expect(disciplinesFor("kayak")).not.toContain("freestyle");
    expect(disciplinesFor(undefined)).toContain("freestyle");
  });
});
