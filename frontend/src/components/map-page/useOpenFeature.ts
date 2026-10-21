import { useCallback, useEffect, useRef, useState } from "react";
import type { Feature, SectionWithFeatures } from "@/lib/api";
import { representativePoint } from "@/lib/geo";

interface OpenFeatureOptions {
  /** The `feature` search param. */
  featureParam: number | undefined;
  section: SectionWithFeatures | undefined;
  setFocusedPoint: (
    update: (prev: [number, number] | null) => [number, number] | null,
  ) => void;
  setFeaturesTab: () => void;
  /** Writes the `feature` search param (replacing the history entry). */
  setFeatureParam: (id: number | undefined) => void;
}

/** The feature open in the section, kept in the URL (`?feature=`) so a reload
 * or the back button restores it. The camera follows it whoever opened it:
 * a row, a tap on the map or the address. */
export function useOpenFeature({
  featureParam,
  section,
  setFocusedPoint,
  setFeaturesTab,
  setFeatureParam,
}: OpenFeatureOptions) {
  // A feature belongs to the open section. A proposal's pseudo entry (a
  // negative id) is no feature yet: it opens its row but stays out of the URL.
  const [proposalId, setProposalId] = useState<number | null>(null);
  const sectionId = section?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on section change
  useEffect(() => setProposalId(null), [sectionId]);
  const selectedFeature: Feature | undefined = section?.features.find(
    (f) => f.id === featureParam,
  );
  const selectedFeatureId = section
    ? (selectedFeature?.id ?? proposalId)
    : null;

  const setSelectedFeatureId = useCallback(
    (id: number | null) => {
      const proposal = id != null && id < 0;
      setProposalId(proposal ? id : null);
      setFeatureParam(proposal ? undefined : (id ?? undefined));
    },
    [setFeatureParam],
  );

  /** A tap on the map: a second tap on the open feature closes it. */
  const openFromMap = useCallback(
    (id: number) => {
      setFeaturesTab();
      setSelectedFeatureId(id === selectedFeatureId ? null : id);
    },
    [selectedFeatureId, setFeaturesTab, setSelectedFeatureId],
  );

  const shownId = useRef<number | null>(null);
  useEffect(() => {
    const id = selectedFeature?.id ?? null;
    if (id === shownId.current) return;
    shownId.current = id;
    if (!selectedFeature) {
      setFocusedPoint(() => null);
      return;
    }
    const p = representativePoint(selectedFeature.location);
    setFocusedPoint((prev) =>
      prev && prev[0] === p[0] && prev[1] === p[1] ? prev : p,
    );
  }, [selectedFeature, setFocusedPoint]);

  return {
    selectedFeatureId,
    selectedFeature,
    setSelectedFeatureId,
    openFromMap,
  };
}
