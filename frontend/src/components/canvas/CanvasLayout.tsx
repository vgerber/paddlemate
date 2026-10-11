import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useOverlay } from "./canvasStore";

/** Where a route's cards and dock go: into the canvas host's overlay, over
 * the map. Renders nothing until the host has a map to float them over, which
 * is also the case below `md` and on routes with no scene. */
export default function CanvasLayout({ children }: { children: ReactNode }) {
  const overlay = useOverlay();
  return overlay ? createPortal(children, overlay) : null;
}
