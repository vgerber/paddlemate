import { theme } from "@/lib/theme";

export type Scheme = "light" | "dark";

/** Design tokens as resolved values (hex), for places that cannot take a
 * `var()`: MapLibre paint, SVG strings turned into images, colour maths.
 * CSS contexts keep importing `tokens` from `theme`. */
export type ResolvedTokens = typeof theme.tokens;

/** Phase 0 stub: light values for both schemes until the dark palette lands. */
export function tokensFor(_scheme: Scheme): ResolvedTokens {
  return theme.tokens;
}

/** The tokens of the active colour scheme. A stable object per scheme, so it
 * is a safe hook dependency. */
export function useTokens(): ResolvedTokens {
  return tokensFor("light");
}
