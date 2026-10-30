import { useCallback, useEffect, useRef, useState } from "react";
import type { Feature } from "@/lib/api";
import type { FeatureSnap } from "./featureSnap";

/** Visible height assumed until the sheet has measured itself, so the first
 * camera move already clears it. */
const FIRST_PEEK = 112;

interface FeatureSheetOptions {
  isMobile: boolean;
  isMobileMapView: boolean;
  selectedFeature: Feature | undefined;
  /** Something else owns the lower half of the map (a suggest flow). */
  blocked: boolean;
  setSectionDetailTab: (tab: "sources") => void;
  enterMapView: () => void;
  exitMapView: () => void;
  setFocusedPoint: (
    update: (prev: [number, number] | null) => [number, number] | null,
  ) => void;
}

/** The phone's feature sheet over the map: open while a feature is selected
 * and the map is in view, until the user closes it. Closing keeps the
 * selection (the selection bar stays); the next pick opens it again. */
export function useFeatureSheet({
  isMobile,
  isMobileMapView,
  selectedFeature,
  blocked,
  setSectionDetailTab,
  enterMapView,
  exitMapView,
  setFocusedPoint,
}: FeatureSheetOptions) {
  const [snap, setSnap] = useState<FeatureSnap>("peek");
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [visible, setVisible] = useState(FIRST_PEEK);

  const open =
    isMobile &&
    isMobileMapView &&
    !blocked &&
    selectedFeature != null &&
    dismissed !== selectedFeature.id;

  /** A pick from the list or the map: the map in view, the sheet at its peek. */
  const show = useCallback(() => {
    setDismissed(null);
    setSnap("peek");
    enterMapView();
  }, [enterMapView]);

  const close = useCallback(
    () => setDismissed(selectedFeature?.id ?? null),
    [selectedFeature?.id],
  );

  // The feature whose history the Sources tab is asked to open.
  const [historyFor, setHistoryFor] = useState<number | null>(null);
  const openHistory = useCallback(
    (id: number) => {
      setHistoryFor(id);
      setSectionDetailTab("sources");
      exitMapView();
    },
    [setSectionDetailTab, exitMapView],
  );

  /** Back to the section's list; the feature stays selected there. */
  const back = exitMapView;

  // The camera clears the sheet: when its visible height changes, ease to the
  // feature again with the new padding.
  const openRef = useRef(open);
  openRef.current = open;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `visible` is the trigger
  useEffect(() => {
    if (openRef.current) setFocusedPoint((p) => (p ? [p[0], p[1]] : p));
  }, [visible, setFocusedPoint]);

  return {
    open,
    snap,
    setSnap,
    visible,
    setVisible,
    show,
    close,
    back,
    historyFor,
    setHistoryFor,
    openHistory,
  };
}

export type FeatureSheetState = ReturnType<typeof useFeatureSheet>;
