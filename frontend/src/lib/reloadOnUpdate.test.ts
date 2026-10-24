import { describe, expect, test } from "bun:test";
import { shouldOfferReload } from "./reloadOnUpdate";

describe("shouldOfferReload", () => {
  test("offers when an older worker was in control", () => {
    expect(shouldOfferReload(true, false)).toBe(true);
  });

  test("stays quiet on a first install", () => {
    expect(shouldOfferReload(false, false)).toBe(false);
  });

  test("offers only once", () => {
    expect(shouldOfferReload(true, true)).toBe(false);
  });
});
