import { darkTokens } from "./darkTokens";
import { lightTokens, type Tokens } from "./tokens";
import { declarations } from "./tokenVars";

/** A hex colour at a 0-1 opacity as `#rrggbbaa`. MUI runs colour maths on the
 * palette, so it takes resolved values: the one place a hex-alpha suffix is
 * still right. */
function alphaHex(hex: string, opacity: number): string {
  const byte = Math.round(opacity * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${byte}`;
}

/** The MUI palette of one scheme, from resolved values (never var strings). */
export function paletteFor(t: Tokens) {
  return {
    primary: {
      main: t.primary,
      dark: t.primaryDark,
      contrastText: t.onPrimary,
    },
    error: {
      main: t.error,
      dark: t.errorDark,
      contrastText: t.onError,
    },
    // Amber for pending/incomplete states, aligned with the medium water
    // level so the app has one orange, not MUI's stock one.
    warning: {
      main: t.levels.medium.text,
      contrastText: t.onError,
    },
    success: {
      main: t.success,
      dark: t.onSuccessContainer,
      contrastText: t.onSuccess,
    },
    background: {
      default: t.background,
      paper: t.surface,
    },
    text: {
      primary: t.onSurface,
      secondary: t.onSurfaceVariant,
      disabled: t.outline,
    },
    divider: t.outlineVariant,
    action: {
      active: t.onSurfaceVariant,
      hover: alphaHex(t.primary, 0.08),
      selected: alphaHex(t.primary, 0.12),
      selectedOpacity: 0.12,
      focus: alphaHex(t.primary, 0.12),
    },
  };
}

/** Light values of the MUI palette variables, for the print override. */
function printPalette(): string {
  const out: string[] = [];
  const walk = (node: object, path: string[]) => {
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === "string")
        out.push(`--mui-palette-${[...path, key].join("-")}:${value};`);
      else if (typeof value === "object") walk(value, [...path, key]);
    }
  };
  walk(paletteFor(lightTokens), []);
  return out.join("");
}

/** The variables of both schemes, generated from the two palettes (no
 * hand-written variable), then the print override: paper is always light. The
 * `--mui-*` lines re-light the palette variables MUI declares per scheme. */
export const tokenCss = [
  `:root{${declarations(lightTokens)}}`,
  `:root[data-theme="dark"]{${declarations(darkTokens)}}`,
  `@media print{:root,:root[data-theme="dark"]{color-scheme:light;${declarations(lightTokens)}${printPalette()}}}`,
].join("");
