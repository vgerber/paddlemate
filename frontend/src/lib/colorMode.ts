import { useColorScheme } from "@mui/material/styles";
import { useEffect } from "react";
import { type Scheme, tokensFor } from "./theme";

/** Where MUI keeps the choice; the inline script in index.html reads it too. */
export const MODE_KEY = "paddlemate-color-mode";

export type ColorMode = "system" | "light" | "dark";

/** The scheme a stored mode shows. Anything but light or dark is System, which
 * follows the device. index.html repeats this before first paint. */
export function resolveScheme(
  mode: string | null | undefined,
  prefersDark: boolean,
): Scheme {
  if (mode === "dark") return "dark";
  if (mode === "light") return "light";
  return prefersDark ? "dark" : "light";
}

/** The frame colour of a scheme, behind the phone's system buttons. Dark is
 * the ground, not the card surface: it is what the dark-media meta in
 * index.html holds too. */
export function themeColorFor(scheme: Scheme): string {
  const t = tokensFor(scheme);
  return scheme === "dark" ? t.background : t.surface;
}

/** The device-local appearance choice and its setter. MUI persists it. */
export function useColorMode(): [ColorMode, (mode: ColorMode) => void] {
  const { mode, setMode } = useColorScheme();
  return [mode ?? "system", setMode];
}

/** Keeps the light-media `<meta name="theme-color">` on the frame of the
 * active scheme after a switch; MUI does not touch it. The dark-media meta is
 * never written: a dark device keeps a dark frame even with the app on Light.
 * Mount once. */
export function useThemeColorMeta() {
  const { colorScheme } = useColorScheme();
  useEffect(() => {
    if (!colorScheme) return;
    document
      .querySelector('meta[name="theme-color"][media*="light"]')
      ?.setAttribute("content", themeColorFor(colorScheme));
  }, [colorScheme]);
}
