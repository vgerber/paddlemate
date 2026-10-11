import { useRef } from "react";
import type { MapScene } from "@/components/canvas/scene";
import type { Trip } from "@/lib/api";
import { useBasesScene } from "./useBasesScene";

/** The map the open trip wants on the canvas: the sections on its watch
 * lists and its base rings, framed as a whole. With no trip open the scene is
 * empty and frames nothing. The scene keeps its identity until what it draws
 * changes, so unrelated renders do not redraw the map. */
export function useTripScene(trip: Trip | null): MapScene {
  const { rings, watched, bounds } = useBasesScene(
    trip?.id ?? null,
    trip?.viewer_role != null,
  );

  // What the map shows, as text: the query layer hands out fresh arrays
  // while the data is the same.
  const signature = JSON.stringify([
    trip?.id ?? null,
    rings,
    watched.map((s) => s.id),
    bounds,
  ]);

  const cache = useRef<{ signature: string; scene: MapScene } | null>(null);
  if (!cache.current || cache.current.signature !== signature) {
    cache.current = {
      signature,
      scene: {
        sections: watched,
        rings,
        subject:
          trip && bounds
            ? {
                key: `trip:${trip.id}:${rings.map((r) => r.id).join(",")}:${watched.map((s) => s.id).join(",")}`,
                bounds,
              }
            : null,
      },
    };
  }
  return cache.current.scene;
}
