import { useMemo } from "react";
import type { MapScene } from "@/components/canvas/scene";
import type { SectionWithFeatures } from "@/lib/api";
import { boundsOf, lineCoords } from "@/lib/geo";
import type { useSectionWizardState } from "./useSectionWizardState";

type Wizard = ReturnType<typeof useSectionWizardState>;

/** The wide-screen map of the suggest-section wizard: the host map draws the
 * waterway, takes the put-in/take-out picks on the line step and the feature
 * vertices on the features step. It frames the waterway, then the drafted
 * line from the features step on; picking itself never moves the camera. */
export function useSuggestScene(
  wizard: Wizard,
  sections: SectionWithFeatures[],
): MapScene {
  const {
    step,
    putIn,
    takeOut,
    finalCoords,
    featurePickActive,
    featureVertices,
    featureGeomType,
    draftFeaturePseudos,
    snap,
    setPutIn,
    setTakeOut,
    setMapBounds,
    setFeatureVertices,
  } = wizard;
  const onLine = step === 1;
  const onFeatures = step === 2;
  const river = snap.river;

  const lineBounds = useMemo(
    () => (finalCoords ? boundsOf(finalCoords) : null),
    [finalCoords],
  );
  const sectionBounds = useMemo(
    () => boundsOf(sections.flatMap((s) => lineCoords(s.location) ?? [])),
    [sections],
  );

  return useMemo<MapScene>(() => {
    const framed = onFeatures && lineBounds ? lineBounds : sectionBounds;
    const key = onFeatures && lineBounds ? "suggest:line" : "suggest:river";
    return {
      sections,
      camera: { onBoundsChange: setMapBounds },
      proposedFeatures:
        onFeatures && draftFeaturePseudos.length > 0
          ? draftFeaturePseudos
          : undefined,
      picking: {
        putIn,
        takeOut,
        onPickPutIn: onLine
          ? ([lon, lat]) => setPutIn({ lat, lon })
          : undefined,
        onPickTakeOut: onLine
          ? ([lon, lat]) => setTakeOut({ lat, lon })
          : undefined,
      },
      drawing: {
        sectionPreviewCoords: finalCoords ?? undefined,
        riverHighlightCoords: river,
        placingFeature: onFeatures && featurePickActive,
        onMapClick:
          onFeatures && featurePickActive
            ? (point) => setFeatureVertices((vertices) => [...vertices, point])
            : undefined,
        featureVertices:
          onFeatures && featureVertices.length > 0
            ? featureVertices
            : undefined,
        featureGeomType,
      },
      subject: framed
        ? { key: `${key}:${sections.length}`, bounds: framed }
        : null,
    };
  }, [
    sections,
    sectionBounds,
    lineBounds,
    onLine,
    onFeatures,
    putIn,
    takeOut,
    finalCoords,
    river,
    featurePickActive,
    featureVertices,
    featureGeomType,
    draftFeaturePseudos,
    setPutIn,
    setTakeOut,
    setMapBounds,
    setFeatureVertices,
  ]);
}
