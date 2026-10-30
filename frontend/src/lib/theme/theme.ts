import { createTheme, type Shadows } from "@mui/material/styles";
import { alphas } from "./alpha";
import { buttonComponents } from "./components/buttons";
import { feedbackComponents } from "./components/feedback";
import { inputComponents } from "./components/inputs";
import { navigationComponents } from "./components/navigation";
import { overlayComponents } from "./components/overlays";
import { surfaceComponents } from "./components/surfaces";
import { darkTokens } from "./darkTokens";
import { paletteFor } from "./palette";
import { lightTokens, type Tokens } from "./tokens";
import { tokens } from "./tokenVars";

export { darkTokens } from "./darkTokens";
export { tokenCss } from "./palette";
export { lightTokens, type Scheme, type Tokens } from "./tokens";
export { tokens, tokensFor, toVars } from "./tokenVars";

// Extend MUI Theme so components can access tokens via theme.tokens
declare module "@mui/material/styles" {
  interface Theme {
    tokens: Tokens;
  }
  interface ThemeOptions {
    tokens?: Partial<Tokens>;
  }
}

/** Font stacks used across the app: one family, weights carry the hierarchy. */
export const fonts = {
  body: '"Figtree Variable", "Figtree", system-ui, sans-serif',
} as const;

const { radii, elevation, motion } = tokens;

/** MUI draws elevation 1 as the card step and everything above as the
 * floating step, so a Paper never invents a shadow of its own. */
const shadows = [
  "none",
  elevation.e1,
  ...Array.from({ length: 23 }, () => elevation.e2),
] as Shadows;

export { alphas };

export const theme = createTheme({
  tokens,
  // `md` is the one switch between the phone layout and the two-pane desktop
  // one, so it sits where the split first fits rather than at MUI's 900:
  // a 320px list plus a readable detail beside it. Tablet portrait and a
  // half-screen laptop window both land above it. The rest are MUI's.
  breakpoints: {
    values: { xs: 0, sm: 600, md: 768, lg: 1200, xl: 1536 },
  },
  cssVariables: {
    colorSchemeSelector: '[data-theme="%s"]',
    cssVarPrefix: "mui",
  },
  colorSchemes: {
    light: { palette: paletteFor(lightTokens) },
    dark: { palette: paletteFor(darkTokens) },
  },

  shape: { borderRadius: radii.md },
  shadows,

  transitions: {
    duration: {
      shortest: motion.instant,
      shorter: motion.fast,
      short: motion.fast,
      standard: motion.base,
      complex: motion.slow,
      enteringScreen: motion.base,
      leavingScreen: motion.fast,
    },
    easing: {
      easeInOut: motion.easeInOut,
      easeOut: motion.easeOut,
      easeIn: motion.easeIn,
      sharp: motion.easeInOut,
    },
  },

  typography: {
    fontFamily: fonts.body,
    h1: {
      fontWeight: 700,
      fontSize: "1.625rem",
      lineHeight: 1.2,
      letterSpacing: "-0.015em",
    },
    h2: {
      fontWeight: 700,
      fontSize: "1.375rem",
      lineHeight: 1.25,
      letterSpacing: "-0.01em",
    },
    h3: {
      fontWeight: 700,
      fontSize: "1.25rem",
      lineHeight: 1.3,
      letterSpacing: "-0.01em",
    },
    h4: { fontWeight: 700, fontSize: "1.125rem", lineHeight: 1.33 },
    h5: { fontWeight: 600, fontSize: "1.0625rem", lineHeight: 1.3 },
    h6: { fontWeight: 600, fontSize: "1rem", lineHeight: 1.25 },
    subtitle1: { fontWeight: 600, fontSize: "0.9375rem", lineHeight: 1.33 },
    subtitle2: { fontWeight: 600, fontSize: "0.8125rem", lineHeight: 1.38 },
    body1: { fontSize: "0.9375rem", lineHeight: 1.33 },
    body2: { fontSize: "0.8125rem", lineHeight: 1.38 },
    overline: {
      fontWeight: 600,
      fontSize: "0.75rem",
      lineHeight: 1.33,
      letterSpacing: "0.02em",
      textTransform: "none",
    },
    caption: { fontSize: "0.75rem", lineHeight: 1.33, letterSpacing: 0 },
    button: {
      fontWeight: 600,
      fontSize: "0.875rem",
      letterSpacing: 0,
      textTransform: "none",
    },
  },

  components: {
    ...surfaceComponents,
    ...buttonComponents,
    ...inputComponents,
    ...navigationComponents,
    ...overlayComponents,
    ...feedbackComponents,
  },
});

/** The bottom gap for the phone's system buttons. Zero on Android and
 * desktops: the page is not drawn under the system bar there (no
 * viewport-fit=cover, see index.html), yet Chrome still reports a bottom
 * safe-area inset, which left a dead band under the bottom nav. On iOS the
 * page is drawn under the home indicator, and this is its safe-area inset.
 * Every bottom inset in the app uses this, never `env(safe-area-inset-bottom)`
 * directly. */
export const SYSTEM_INSET = "var(--system-inset)";

/** Height of a full-screen panel: the window less the desktop app bar, or
 * less the mobile bottom nav and its safe area. A panel that pins a bottom
 * bar needs a bounded height to size its scroller against. */
export const PANEL_HEIGHT = {
  xs: `calc(100dvh - ${tokens.chrome.bottomNav}px - ${SYSTEM_INSET})`,
  md: `calc(100vh - ${tokens.chrome.appBar}px)`,
} as const;

/** Space the fixed bottom nav takes at the foot of the page. */
export const BOTTOM_NAV_SPACE = `calc(${tokens.chrome.bottomNav}px + ${SYSTEM_INSET})`;

/** The app's standard small label: 12px, semibold, sentence case. Spread into
 * sx and override size or color where a variant is needed. */
export const labelSx = {
  fontFamily: fonts.body,
  fontWeight: 600,
  letterSpacing: 0,
  fontSize: "0.75rem",
  color: "text.secondary",
} as const;

/** A card or row title: 15px, semibold, 20 line. */
export const cardTitleSx = {
  fontWeight: 600,
  fontSize: "0.9375rem",
  lineHeight: "20px",
} as const;

/** An in-screen section heading, the name of the block below: 13px, semibold,
 * 18 line, sentence case. Spread into sx; SectionHeading is the component. */
export const sectionHeadingSx = {
  ...labelSx,
  fontSize: "0.8125rem",
  lineHeight: "18px",
} as const;
