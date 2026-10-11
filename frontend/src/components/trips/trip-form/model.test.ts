import { describe, expect, test } from "bun:test";
import { defaultTripForm, tripFormError } from "./model";

const ready = { ...defaultTripForm(), name: "Week", start_date: "2026-07-10" };

describe("tripFormError", () => {
  test("asks for a name first", () => {
    expect(tripFormError(defaultTripForm(), false)).toBe(
      "A trip needs a name.",
    );
  });

  test("an end before the start is a problem, the same day is not", () => {
    expect(tripFormError({ ...ready, end_date: "2026-07-09" }, false)).toMatch(
      /end date/,
    );
    expect(
      tripFormError({ ...ready, end_date: "2026-07-10" }, false),
    ).toBeNull();
  });

  test("a new trip needs its first base named", () => {
    expect(tripFormError(ready, true)).toMatch(/first stay/);
    expect(tripFormError({ ...ready, stay_name: "Camp" }, true)).toBeNull();
  });
});
