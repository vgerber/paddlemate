import { describe, expect, test } from "bun:test";
import { stretches } from "./calendarBands";

describe("stretches", () => {
  test("is empty when no day is in the trip", () => {
    expect(stretches([false, false, false])).toEqual([]);
  });
  test("joins neighbouring days into one band", () => {
    expect(stretches([false, true, true, true, false])).toEqual([[1, 3]]);
  });
  test("keeps separate bands apart", () => {
    expect(stretches([true, false, true, true])).toEqual([
      [0, 0],
      [2, 3],
    ]);
  });
});
