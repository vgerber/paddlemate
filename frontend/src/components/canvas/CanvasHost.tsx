import useMediaQuery from "@mui/material/useMediaQuery";
import { useRouterState } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { theme } from "@/lib/theme";
import { isGeographyRoute } from "./canvasRoutes";
import { useScene } from "./canvasStore";

// The map is heavy and most routes never set a scene, so it loads on demand.
const CanvasHostView = lazy(() => import("./CanvasHostView"));

/** The one map behind the floating cards, mounted at `md` and up on the
 * geography routes once a route has set a scene. Everywhere else it renders
 * nothing and the map is released. */
export default function CanvasHost() {
  const wide = useMediaQuery(theme.breakpoints.up("md"));
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({
    select: (s) => s.location.search as Record<string, unknown>,
  });
  const scene = useScene();
  if (!wide || !isGeographyRoute(pathname, search) || !scene) return null;
  return (
    <Suspense fallback={null}>
      <CanvasHostView scene={scene} />
    </Suspense>
  );
}
