import { describe, expect, test } from "bun:test";
import { countLabel } from "./ListPaneHeader";

const log = { one: "log", other: "logs" };

describe("countLabel", () => {
  test("uses the singular for one", () => {
    expect(countLabel(1, log)).toBe("1 log");
  });

  test("uses the plural otherwise", () => {
    expect(countLabel(0, log)).toBe("0 logs");
    expect(countLabel(12, log)).toBe("12 logs");
  });
});
