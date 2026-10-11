import { createFileRoute, notFound } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

// The demo import sits behind the DEV check so a production build drops the
// chunk and the route is not found.
const Demo = import.meta.env.DEV
  ? lazy(() => import("@/components/dev/CanvasDemo"))
  : null;

export const Route = createFileRoute("/dev/canvas")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: () =>
    Demo && (
      <Suspense fallback={null}>
        <Demo />
      </Suspense>
    ),
});
