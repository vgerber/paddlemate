import { describe, expect, test } from "bun:test";
import { layerOf, withLayer } from "./useBackToClose";

describe("layer marks", () => {
  test("a marked state reads back its id and keeps the router keys", () => {
    const state = withLayer({ __TSR_index: 3, key: "k" }, 7);
    expect(layerOf(state)).toBe(7);
    expect(state).toMatchObject({ __TSR_index: 3, key: "k" });
  });

  test("unmarked or missing state has no layer", () => {
    expect(layerOf({ __TSR_index: 0 })).toBeUndefined();
    expect(layerOf(null)).toBeUndefined();
    expect(layerOf(undefined)).toBeUndefined();
  });

  test("marking a missing state still works", () => {
    expect(layerOf(withLayer(null, 0))).toBe(0);
  });
});
