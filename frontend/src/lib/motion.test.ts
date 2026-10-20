import { describe, expect, test } from "bun:test";
import { css, transition } from "./motion";

describe("transition", () => {
  test("defaults to the base duration and ease out", () => {
    expect(transition("opacity")).toBe(`opacity ${css.base} ${css.easeOut}`);
  });

  test("joins several properties and takes a token duration", () => {
    expect(
      transition(["color", "background-color"], { duration: "fast" }),
    ).toBe(
      `color ${css.fast} ${css.easeOut}, background-color ${css.fast} ${css.easeOut}`,
    );
  });

  test("a computed time overrides the token and is rounded", () => {
    expect(transition("transform", { ms: 120.4, easing: "easeIn" })).toBe(
      `transform 120ms ${css.easeIn}`,
    );
  });
});
