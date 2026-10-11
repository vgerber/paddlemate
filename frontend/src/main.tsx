import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ErrorFallback from "./components/states/ErrorFallback";
import { theme } from "./lib/theme";
import { routeTree } from "./routeTree.gen";
import "@fontsource-variable/figtree";
import "./index.css";

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
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>,
);
