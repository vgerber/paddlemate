import { useCallback, useState } from "react";
import type { Feature } from "@/lib/api";
import { type LngLat, lineCoords, pointCoords } from "@/lib/geo";

export type FeatureGeomType = "Point" | "LineString" | "Polygon";

/** Map-driven feature geometry drawing: pick vertices on the map for the
 * suggest/edit feature flows, including seeding from an existing feature. */
export function useFeaturePicker() {
  const [featurePickingActive, setFeaturePickingActive] = useState(false);
  const [featureGeomType, setFeatureGeomType] =
    useState<FeatureGeomType>("Point");
  const [featureVertices, setFeatureVertices] = useState<LngLat[]>([]);
  // Feature being edited in the suggest-feature panel; null = creating new.
  const [editFeature, setEditFeature] = useState<Feature | null>(null);

  /** Seed the picker with an existing feature's geometry so it is visible
   * and adjustable on the map. */
  const seedFromFeature = useCallback((f: Feature) => {
    const loc = f.location;
    const point = pointCoords(loc);
    const line = lineCoords(loc);
    if (point) {
      setFeatureGeomType("Point");
      setFeatureVertices([point]);
    } else if (line) {
      setFeatureGeomType("LineString");
      setFeatureVertices(line);
    } else if (loc.type === "Polygon") {
      const ring = (loc.coordinates as [number, number][][])[0] ?? [];
      setFeatureGeomType("Polygon");
      setFeatureVertices(
        // Drop the closing vertex; the picker re-closes the ring on submit.
        ring.slice(0, Math.max(ring.length - 1, 0)),
      );
    }
    setFeaturePickingActive(false);
    setEditFeature(f);
  }, []);

  const handleMapPick = useCallback(
    (point: LngLat) => {
      if (featurePickingActive) {
        setFeatureVertices((prev) => [...prev, point]);
      }
    },
    [featurePickingActive],
  );

  const reset = useCallback(() => {
    setFeatureVertices([]);
    setFeaturePickingActive(false);
    setFeatureGeomType("Point");
    setEditFeature(null);
  }, []);

  return {
    featurePickingActive,
    setFeaturePickingActive,
    featureGeomType,
    setFeatureGeomType,
    featureVertices,
    setFeatureVertices,
    editFeature,
    seedFromFeature,
    handleMapPick,
    reset,
  };
}
