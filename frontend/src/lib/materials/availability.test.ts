import { describe, expect, test } from "bun:test";
import {
  availabilityChecked,
  availabilityValue,
  rowAvailabilityLabel,
  sourceHost,
} from "./availability";

describe("availabilityValue", () => {
  test("states the three cases", () => {
    expect(availabilityValue({ availability: "current" })).toBe("Still made");
    expect(availabilityValue({ availability: "unknown" })).toBe("Unknown");
    expect(availabilityValue({ availability: "discontinued" })).toBe(
      "Discontinued",
    );
  });

  test("names the last model year of a discontinued model only", () => {
    expect(
      availabilityValue({ availability: "discontinued", year_to: 2008 }),
    ).toBe("Discontinued (last model year 2008)");
    expect(availabilityValue({ availability: "current", year_to: 2008 })).toBe(
      "Still made",
    );
  });
});

describe("availabilityChecked", () => {
  test("is the checked day, or nothing", () => {
    expect(
      availabilityChecked({
        availability: "current",
        availability_checked: "2026-11-01",
      }),
    ).toBe("Checked 01 Nov 2026");
    expect(availabilityChecked({ availability: "current" })).toBeUndefined();
  });
});

test("sourceHost drops www and survives a bad link", () => {
  expect(sourceHost("https://www.nrs.com/kayaks?x=1")).toBe("nrs.com");
  expect(sourceHost("not a url")).toBe("not a url");
});

test("only a discontinued model gets a row label", () => {
  expect(rowAvailabilityLabel({ availability: "discontinued" })).toBe(
    "Discontinued",
  );
  expect(rowAvailabilityLabel({ availability: "current" })).toBeUndefined();
  expect(rowAvailabilityLabel({ availability: "unknown" })).toBeUndefined();
});
