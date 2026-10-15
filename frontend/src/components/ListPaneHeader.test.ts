import { describe, expect, test } from "bun:test";
import { countLabel } from "./ListPaneHeader";

describe("countLabel", () => {
  test("uses the singular for one", () => {
    expect(countLabel(1)).toBe("1 result");
  });

  test("uses the plural otherwise", () => {
    expect(countLabel(0)).toBe("0 results");
    expect(countLabel(12)).toBe("12 results");
  });
});
