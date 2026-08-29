import { useEffect, useMemo, useRef, useState } from "react";
import type {
  GeometryPicking,
  GeomType,
} from "@/components/waterway/GeometryPicker";
import {
  createInitialNaming,
  type SectionNamingValue,
} from "@/components/waterway/SectionNamingForm";
import type { SectionFeatureDraft } from "@/components/waterway/SuggestFeatureForm";
import { toPseudoFeature } from "@/components/waterway/section-details/utils";
import { type Feature, regionsApi, type SectionWithFeatures } from "@/lib/api";
import { downstreamDot, lineCoords } from "@/lib/geo";
import { useRiverSnap } from "@/lib/hooks/useRiverSnap";
import type { BoundingBox, Coordinate } from "@/lib/riverSnap";

export const WIZARD_STEPS = ["Naming", "Section", "Features"] as const;

/** All state of the three-step suggest-section wizard: naming, the picked
 * section line (with OSM snap), and drafted features with map drawing. */
export function useSectionWizardState(
  waterwayName: string,
  sections: SectionWithFeatures[],
  waterwayId?: number | null,
) {
  const [step, setStep] = useState(0);

  // Step 1: naming
  const [naming, setNaming] = useState<SectionNamingValue>(createInitialNaming);

  // Step 2: section line
  const [putIn, setPutIn] = useState<{ lat: number; lon: number } | null>(null);
  const [takeOut, setTakeOut] = useState<{ lat: number; lon: number } | null>(
    null,
  );
  const [lineSource, setLineSource] = useState<"snap" | "straight">("snap");
  const [mapBounds, setMapBounds] = useState<BoundingBox | null>(null);
  const snap = useRiverSnap(
    waterwayName,
    putIn,
    takeOut,
    mapBounds,
    waterwayId,
  );

  // Step 3: features (drafted with the shared feature form, drawn on the map)
  const [draftFeatures, setDraftFeatures] = useState<SectionFeatureDraft[]>([]);
  const [featureVertices, setFeatureVertices] = useState<
    { lng: number; lat: number }[]
  >([]);
  const [featureGeomType, setFeatureGeomType] = useState<GeomType>("Point");
  const [featurePickActive, setFeaturePickActive] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);

  const featureGeometry: GeometryPicking = {
    vertices: featureVertices,
    geomType: featureGeomType,
    pickingActive: featurePickActive,
    onGeomTypeChange: (t) => {
      setFeatureGeomType(t);
      setFeatureVertices([]);
    },
    onRequestPick: () => setFeaturePickActive(true),
    onStopPick: () => setFeaturePickActive(false),
    onRemoveVertex: (i) =>
      setFeatureVertices((vertices) =>
        vertices.filter((_, index) => index !== i),
      ),
    onClearVertices: () => setFeatureVertices([]),
  };

  // Bring the map into view whenever a pick starts (any trigger: place
  // point, start drawing a line/area, move) - the buttons sit below the
  // map, often off-screen on mobile. Deferred a frame so the button's own
  // focus scrolling can't cancel the smooth scroll.
  useEffect(() => {
    if (!featurePickActive) return;
    const frame = requestAnimationFrame(() => {
      mapContainerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [featurePickActive]);

  const hasLocation = putIn != null && takeOut != null;
  const snapActive = lineSource === "snap" && snap.status === "done";

  // Region and country, derived server-side from the section line once the
  // features step is reached, shown there as editable fields. A hand-edited
  // value is never overwritten by a late lookup.
  const [regionInfo, setRegionInfoState] = useState({
    regions: "",
    country: "",
  });
  const [regionLookup, setRegionLookup] = useState<
    "idle" | "loading" | "done" | "failed"
  >("idle");
  const regionTouched = useRef(false);
  const setRegionInfo = (patch: Partial<typeof regionInfo>) => {
    regionTouched.current = true;
    setRegionInfoState((prev) => ({ ...prev, ...patch }));
  };

  const finalCoords: Coordinate[] | null = useMemo(
    () =>
      lineSource === "snap" &&
      snap.snappedCoords &&
      snap.snappedCoords.length >= 2
        ? snap.snappedCoords
        : putIn && takeOut
          ? [
              [putIn.lon, putIn.lat],
              [takeOut.lon, takeOut.lat],
            ]
          : null,
    [lineSource, snap.snappedCoords, putIn, takeOut],
  );

  // Derive once per line when the features step is reached - three sample
  // points (start, middle, end) are all the server needs.
  const derivedForCoords = useRef<Coordinate[] | null>(null);
  useEffect(() => {
    if (step !== 2 || !finalCoords || finalCoords.length < 2) return;
    if (derivedForCoords.current === finalCoords) return;
    derivedForCoords.current = finalCoords;
    const samples = [
      finalCoords[0],
      finalCoords[Math.floor(finalCoords.length / 2)],
      finalCoords[finalCoords.length - 1],
    ];
    const controller = new AbortController();
    setRegionLookup("loading");
    regionsApi
      .list(samples, controller.signal)
      .then((regions) => {
        if (controller.signal.aborted) return;
        setRegionLookup("done");
        if (regionTouched.current) return;
        // The country comes back as the trailing entry; the rest are the
        // region names, most specific first.
        setRegionInfoState({
          regions: regions
            .filter((region) => region.kind !== "country")
            .map((region) => region.name)
            .join(", "),
          country:
            regions.find((region) => region.kind === "country")?.name ?? "",
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setRegionLookup("failed");
      });
    return () => controller.abort();
  }, [step, finalCoords]);

  const orderWrong =
    hasLocation &&
    sections.length > 0 &&
    downstreamDot(
      sections.map((s) => lineCoords(s.location) ?? []),
      putIn,
      takeOut,
    ) < 0;

  // Drafted features shown on the map as ghost markers (same rendering as
  // pending feature proposals)
  const draftFeaturePseudos: Feature[] = useMemo(
    () =>
      draftFeatures.map((feature, index) =>
        toPseudoFeature(
          {
            feature_type: feature.feature_type,
            // Full-section features are label-suppressed on the map, so
            // the difficulty fallback must not resurface there either
            metadata: feature.used_section_line
              ? { ...feature.metadata, difficulty: undefined }
              : feature.metadata,
            location: (feature.used_section_line && finalCoords
              ? { type: "LineString", coordinates: finalCoords }
              : feature.location) as Feature["location"],
            // Full-section features skip the on-map name label - the section
            // label already covers the whole line
            name: feature.used_section_line ? null : feature.name,
            lang_code: feature.lang_code,
          },
          index,
        ),
      ),
    [draftFeatures, finalCoords],
  );

  const canProceed =
    step === 0
      ? naming.name.trim().length > 0
      : step === 1
        ? hasLocation
        : true;

  return {
    step,
    setStep,
    naming,
    setNaming,
    putIn,
    setPutIn,
    takeOut,
    setTakeOut,
    setLineSource,
    setMapBounds,
    snap,
    draftFeatures,
    setDraftFeatures,
    featureVertices,
    setFeatureVertices,
    featureGeomType,
    featurePickActive,
    featureGeometry,
    mapContainerRef,
    hasLocation,
    snapActive,
    finalCoords,
    orderWrong,
    draftFeaturePseudos,
    canProceed,
    regionInfo,
    setRegionInfo,
    regionLookup,
  };
}
