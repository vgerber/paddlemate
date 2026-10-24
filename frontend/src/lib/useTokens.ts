import { useColorScheme } from "@mui/material/styles";
import { useMemo } from "react";
import { tokensFor as paletteFor, type Scheme, type Tokens } from "@/lib/theme";

export type { Scheme };

/** Design tokens as resolved values (hex), for places that cannot take a
 * `var()`: MapLibre paint, SVG strings turned into images, colour maths.
 * CSS contexts keep importing `tokens` from `theme`. */
export type ResolvedTokens = Tokens;

export function tokensFor(scheme: Scheme): ResolvedTokens {
  return paletteFor(scheme);
}

/** The tokens of the active colour scheme (System resolved through the
 * device). The object changes identity only when the scheme does, so it is a
 * safe hook dependency. */
export function useTokens(): ResolvedTokens {
  const { colorScheme } = useColorScheme();
  const scheme: Scheme = colorScheme === "dark" ? "dark" : "light";
  return useMemo(() => tokensFor(scheme), [scheme]);
}
