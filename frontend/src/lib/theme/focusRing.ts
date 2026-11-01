import { tokens } from "./tokenVars";

/** The keyboard focus outline: 2px in the brand colour. */
export function focusRing(offset = 2) {
  return {
    outline: `2px solid ${tokens.primary}`,
    outlineOffset: offset,
  } as const;
}

/** The ring on `:focus-visible` and MUI's `.Mui-focusVisible`, as an sx
 * fragment. `offset` is negative for a control that fills its box (a row, a
 * tab) so the ring is not clipped. A different selector (a child, `:has`)
 * spreads `focusRing()` under its own key. */
export function focusRingSx(offset = 2) {
  return {
    "&:focus-visible, &.Mui-focusVisible": focusRing(offset),
  } as const;
}
