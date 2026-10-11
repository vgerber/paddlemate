import { createFileRoute, notFound } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

// The gallery import sits behind the DEV check so a production build drops
// the chunk and the route is not found.
const Gallery = import.meta.env.DEV
  ? lazy(() => import("@/components/dev/PrimitivesGallery"))
  : null;

export const Route = createFileRoute("/dev/primitives")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: () =>
    Gallery && (
      <Suspense fallback={null}>
        <Gallery />
      </Suspense>
    ),
});
