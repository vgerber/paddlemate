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

/** The browser bar colour of a scheme: the colour of the screen under it. */
export function themeColorFor(scheme: Scheme): string {
  return tokensFor(scheme).surface;
}

/** The device-local appearance choice and its setter. MUI persists it. */
export function useColorMode(): [ColorMode, (mode: ColorMode) => void] {
  const { mode, setMode } = useColorScheme();
  return [mode ?? "system", setMode];
}

/** Keeps `<meta name="theme-color">` equal to the screen under it after a
 * switch; MUI does not touch the meta. Mount once. */
export function useThemeColorMeta() {
  const { colorScheme } = useColorScheme();
  useEffect(() => {
    if (!colorScheme) return;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", themeColorFor(colorScheme));
  }, [colorScheme]);
}
