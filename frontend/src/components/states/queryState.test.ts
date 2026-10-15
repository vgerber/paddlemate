import { describe, expect, test } from "bun:test";
import { queryViewState } from "./queryState";

describe("queryViewState", () => {
  test("loading with nothing yet", () => {
    expect(queryViewState({ isLoading: true, isError: false, count: 0 })).toBe(
      "loading",
    );
  });
  test("a failure with no rows is an error, not empty", () => {
    expect(queryViewState({ isLoading: false, isError: true, count: 0 })).toBe(
      "error",
    );
  });
  test("no rows and no failure is empty", () => {
    expect(queryViewState({ isLoading: false, isError: false, count: 0 })).toBe(
      "empty",
    );
  });
  test("rows win over a failed refetch", () => {
    expect(queryViewState({ isLoading: false, isError: true, count: 2 })).toBe(
      "filled",
    );
  });
});
