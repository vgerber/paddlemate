import CssBaseline from "@mui/material/CssBaseline";
import GlobalStyles from "@mui/material/GlobalStyles";
import { ThemeProvider } from "@mui/material/styles";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ErrorFallback from "./components/states/ErrorFallback";
import { MODE_KEY, useThemeColorMeta } from "./lib/colorMode";
import { theme, tokenCss } from "./lib/theme";
import { routeTree } from "./routeTree.gen";
import "@fontsource-variable/figtree";
// Loaded up front, not with the lazy map: it must precede index.css and the
// emotion styles it is overridden by.
import "maplibre-gl/dist/maplibre-gl.css";
import "./index.css";

/** Mounted once inside the provider: keeps the browser bar colour in step. */
function ThemeColorSync() {
  useThemeColorMeta();
  return null;
}

const router = createRouter({
  routeTree,
  // A route component that throws renders this instead of a blank page.
  defaultErrorComponent: ErrorFallback,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");
createRoot(rootEl).render(
  <StrictMode>
    <ThemeProvider
      theme={theme}
      defaultMode="system"
      modeStorageKey={MODE_KEY}
      noSsr
      disableTransitionOnChange
    >
      <GlobalStyles styles={tokenCss} />
      <CssBaseline />
      <ThemeColorSync />
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>,
);
