import { describe, expect, test } from "bun:test";
import type { Material } from "@/lib/api";
import { missingFields, missingSentence } from "./missing";

function entry(fields: Partial<Material> = {}): Material {
  return {
    id: 1,
    category: "kayak",
    disciplines: ["creek"],
    brand: "T",
    colors: [],
    siblings: [],
    year_approximate: false,
    availability: "current",
    images: [{ id: 1, credit: "x" }] as Material["images"],
    model: "C",
    created_by: "u",
    created_at: "2026-01-01T12:00:00Z",
    updated_at: "2026-01-01T12:00:00Z",
    length_cm: 270,
    width_cm: 60,
    volume_l: 90,
    weight_kg: 20,
    cockpit_length_cm: 80,
    paddler_weight_min_kg: 60,
    year_from: 2020,
    construction: "plastic",
    ...fields,
  } as Material;
}

describe("missingFields", () => {
  test("a complete boat misses nothing", () => {
    expect(missingFields(entry())).toEqual([]);
  });
  test("lists empty boat fields, availability and photo", () => {
    const m = entry({
      volume_l: null,
      year_from: null,
      availability: "unknown",
      images: [],
    });
    expect(missingFields(m)).toEqual([
      "volume",
      "release year",
      "availability",
      "photo",
    ]);
  });
  test("a boat without groups misses groups", () => {
    expect(missingFields(entry({ disciplines: [] }))).toEqual(["groups"]);
  });
  test("a paddle is judged by paddle fields", () => {
    const paddle = entry({
      category: "paddle",
      disciplines: [],
      blade_area_cm2: 650,
      length_min_cm: 190,
      weight_kg: 0.9,
      shaft: "straight",
      pieces: 2,
      year_from: 2020,
      volume_l: null,
    });
    expect(missingFields(paddle)).toEqual([]);
    expect(missingFields({ ...paddle, pieces: null })).toEqual(["pieces"]);
  });
});

describe("missingSentence", () => {
  test("is empty for nothing missing", () => {
    expect(missingSentence([])).toBe("");
  });
  test("names one, two or many, photo first", () => {
    expect(missingSentence(["photo"])).toBe("No photo yet");
    expect(missingSentence(["volume", "photo"])).toBe("No photo or volume yet");
    expect(missingSentence(["volume", "release year", "photo"])).toBe(
      "No photo, volume or release year yet",
    );
  });
});
