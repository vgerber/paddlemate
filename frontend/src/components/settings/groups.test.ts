import { describe, expect, test } from "bun:test";
import { GROUPS, groupLabel, isGroupId, parseGroup } from "./groups";

describe("settings groups", () => {
  test("every group id is recognised", () => {
    for (const g of GROUPS) expect(isGroupId(g.id)).toBe(true);
  });

  test("unknown values are not groups", () => {
    expect(isGroupId("billing")).toBe(false);
    expect(isGroupId(undefined)).toBe(false);
    expect(parseGroup("billing")).toBeUndefined();
    expect(parseGroup("tokens")).toBe("tokens");
  });

  test("labels come from the list", () => {
    expect(groupLabel("tokens")).toBe("Access tokens");
  });
});
