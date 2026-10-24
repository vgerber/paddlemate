import { expect } from "@playwright/test";

/** r, g, b (0-255) and alpha of a computed colour, whichever syntax the
 * browser serialises: `rgb(...)` or, for a mixed colour, `color(srgb ... / a)`. */
export function parseColour(css: string): number[] {
  const nums = css.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
  const [r, g, b, a = 1] = nums;
  const scale = css.startsWith("color(") ? 255 : 1;
  return [r * scale, g * scale, b * scale]
    .map(Math.round)
    .concat(Math.round(a * 100) / 100);
}

export function expectColour(actual: string, expected: string) {
  expect(parseColour(actual)).toEqual(parseColour(expected));
}
