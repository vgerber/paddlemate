import { useLayoutEffect, useRef } from "react";
import { dockMode, type FreeArea } from "@/lib/canvasLayout";
import { scenes, useLayout, useScene } from "./canvasStore";
import type { MapScene } from "./scene";

export type { MapScene } from "./scene";
export { useScene };

/** Sets the map the canvas draws while this component is mounted. Pass a
 * memoised scene: a new object each render redraws the map each render. The
 * scene is cleared on unmount unless a newer route has already replaced it.
 * A screen inside a route passes a higher `rank` so its scene stays on top. */
export function useCanvasScene(scene: MapScene, rank = 0) {
  const owner = useRef<symbol>(Symbol("canvas-scene"));
  useLayoutEffect(() => {
    scenes.set(owner.current, scene, rank);
  }, [scene, rank]);
  useLayoutEffect(() => {
    const token = owner.current;
    return () => scenes.clear(token);
  }, []);
}

/** The free map area (what no card or dock covers) and its fit padding. */
export function useFreeArea(): FreeArea {
  return useLayout((s) => s.free);
}

/** "dock" (the reading rail) from 1280 wide and 600 tall, else "inline" (the
 * first block of the detail card). */
export function useDockMode(): "dock" | "inline" {
  return useLayout((s) => dockMode(s.viewport.w, s.viewport.h));
}

export interface CanvasLayoutInfo {
  free: FreeArea;
  dockMode: "dock" | "inline";
  windowWidth: number;
}

export function useCanvasLayout(): CanvasLayoutInfo {
  const free = useFreeArea();
  const mode = useDockMode();
  const windowWidth = useLayout((s) => s.viewport.w);
  return { free, dockMode: mode, windowWidth };
}
