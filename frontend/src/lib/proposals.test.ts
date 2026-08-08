import { describe, expect, test } from "bun:test";
import type { Proposal } from "./api";
import {
  diffObjects,
  isDisplayable,
  proposalTitle,
  shortValue,
} from "./proposals";

describe("isDisplayable", () => {
  test("hides null, empty string, empty array and empty object", () => {
    expect(isDisplayable(null)).toBe(false);
    expect(isDisplayable(undefined)).toBe(false);
    expect(isDisplayable("")).toBe(false);
    expect(isDisplayable([])).toBe(false);
    expect(isDisplayable({})).toBe(false);
  });

  test("shows real values including falsy numbers", () => {
    expect(isDisplayable("x")).toBe(true);
    expect(isDisplayable(0)).toBe(true);
    expect(isDisplayable(false)).toBe(true);
    expect(isDisplayable([1])).toBe(true);
    expect(isDisplayable({ a: 1 })).toBe(true);
  });
});

describe("diffObjects", () => {
  test("reports changed, added and removed keys only", () => {
    const diffs = diffObjects(
      { same: 1, changed: "a", removed: true },
      { same: 1, changed: "b", added: 2 },
    );
    const byKey = Object.fromEntries(diffs.map((d) => [d.key, d]));
    expect(Object.keys(byKey).sort()).toEqual(["added", "changed", "removed"]);
    expect(byKey.changed).toMatchObject({ from: "a", to: "b" });
    expect(byKey.added).toMatchObject({ from: undefined, to: 2 });
    expect(byKey.removed).toMatchObject({ from: true, to: undefined });
  });

  test("deep-equal values are not diffs", () => {
    expect(diffObjects({ a: { x: [1, 2] } }, { a: { x: [1, 2] } })).toEqual([]);
  });
});

describe("shortValue", () => {
  test("null is a dash", () => {
    expect(shortValue("any", null)).toBe("-");
  });

  test("summarizes bundled features", () => {
    expect(
      shortValue("features", [
        { feature_type: "put_in" },
        { feature_type: "rapid", name: "Big Hole" },
        { feature_type: "whitewater", metadata: { difficulty: "III+" } },
      ]),
    ).toBe("put in, rapid (Big Hole), whitewater (III+)");
  });

  test("lists translation languages", () => {
    expect(
      shortValue("translations", [{ lang_code: "de" }, { lang_code: "en" }]),
    ).toBe("DE, EN");
  });

  test("flattens simple metadata entries", () => {
    expect(shortValue("metadata", { difficulty: "III+", grade: 2 })).toBe(
      "difficulty III+, grade 2",
    );
  });

  test("truncates long strings with an ellipsis", () => {
    const long = "x".repeat(80);
    const out = shortValue("description", long);
    expect(out.length).toBe(58);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("proposalTitle", () => {
  const proposal = (overrides: Partial<Proposal>): Proposal =>
    ({
      entity_type: "water_section",
      operation: "create",
      proposed_data: {},
      original_data: null,
      ...overrides,
    }) as Proposal;

  test("prefers the proposed name", () => {
    expect(
      proposalTitle(
        proposal({
          proposed_data: { name: "New name" },
          original_data: { name: "Old name" },
        }),
      ),
    ).toBe("New name");
  });

  test("falls back to the original name, then feature type", () => {
    expect(
      proposalTitle(proposal({ original_data: { name: "Old name" } })),
    ).toBe("Old name");
    expect(
      proposalTitle(
        proposal({
          entity_type: "feature",
          proposed_data: { feature_type: "put_in" },
        }),
      ),
    ).toBe("put in");
  });

  test("last resort is the entity label", () => {
    expect(proposalTitle(proposal({}))).toBe("Section");
  });
});
