import { describe, expect, test } from "bun:test";
import {
  type ReadingView,
  readingNumberText,
  readingTimeLine,
} from "./readingView";

const view = (over: Partial<ReadingView>): ReadingView => ({
  time: "18:48",
  age: "12m ago",
  value: 1,
  unit: "cm",
  stale: false,
  ...over,
});

describe("readingNumberText", () => {
  test("a dash without a value", () => {
    expect(readingNumberText(null)).toBe("-");
  });
  test("one decimal at most, no trailing zero", () => {
    expect(readingNumberText(12.34)).toBe("12.3");
    expect(readingNumberText(12)).toBe("12");
    expect(readingNumberText(0)).toBe("0");
  });
});

describe("readingTimeLine", () => {
  test("joins time and age", () => {
    expect(readingTimeLine(view({}))).toBe("18:48 · 12m ago");
  });
  test("time alone without an age", () => {
    expect(readingTimeLine(view({ age: "" }))).toBe("18:48");
  });
});
