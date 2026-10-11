import { expect, test } from "bun:test";
import { gradeSummary } from "./gradeSummary";

test("a range reads min-max", () => {
  expect(gradeSummary(3, 4)).toBe("III-IV");
});

test("one grade reads once", () => {
  expect(gradeSummary(3, 3)).toBe("III");
});

test("only a minimum reads as III+", () => {
  expect(gradeSummary(3, "")).toBe("III+");
});

test("only a maximum reads as -IV", () => {
  expect(gradeSummary("", 4)).toBe("-IV");
});

test("nothing set is empty", () => {
  expect(gradeSummary("", "")).toBe("");
});
