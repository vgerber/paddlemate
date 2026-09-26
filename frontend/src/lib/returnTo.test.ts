import { describe, expect, test } from "bun:test";
import { returnState, safeReturnTo } from "./returnTo";

describe("safeReturnTo", () => {
  test("returns to a page on this site, query included", () => {
    expect(safeReturnTo({ returnTo: "/invite/abc" })).toBe("/invite/abc");
    expect(safeReturnTo({ returnTo: "/trips?selected=4" })).toBe(
      "/trips?selected=4",
    );
  });

  test("never follows a way off the site", () => {
    for (const to of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "\\\\evil.example",
      "javascript:alert(1)",
      "evil.example",
    ]) {
      expect(safeReturnTo({ returnTo: to })).toBeNull();
    }
  });

  test("does not come back to the sign-in callback", () => {
    expect(safeReturnTo({ returnTo: "/auth/callback" })).toBeNull();
  });

  test("ignores a state that is not ours", () => {
    for (const state of [undefined, null, "/trips", 4, {}, { returnTo: 4 }]) {
      expect(safeReturnTo(state)).toBeNull();
    }
  });

  test("round-trips what returnState sends", () => {
    const state = returnState({ pathname: "/invite/abc", search: "?x=1" });
    expect(safeReturnTo(state)).toBe("/invite/abc?x=1");
  });
});
