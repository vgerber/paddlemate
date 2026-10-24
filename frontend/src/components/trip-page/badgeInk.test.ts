import { describe, expect, test } from "bun:test";
import { badgeInk } from "./badgeInk";

describe("badgeInk", () => {
  test("light always keeps white", () => {
    expect(badgeInk("#E69F00", "#062530", false)).toBe("#ffffff");
  });

  test("dark takes the ink on a light orange badge", () => {
    expect(badgeInk("#E69F00", "#062530", true)).toBe("#062530");
  });

  test("dark keeps white on a deep blue badge", () => {
    expect(badgeInk("#0072B2", "#062530", true)).toBe("#ffffff");
  });
});
