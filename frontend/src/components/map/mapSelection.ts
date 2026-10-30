import type { Feature, SectionWithFeatures } from "@/lib/api";
import type { AreaCircle } from "@/lib/map/geo";
import { circleGeoJSON, pointCoords } from "@/lib/map/geo";
import type { GaugePin } from "./GaugeMarkers";
import { buildSectionsGeoJSON } from "./mapLayers";
import type { RingTarget } from "./TargetRing";

const EMPTY: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

/** The selected section's line out of the drawn sections. */
export function selectedSectionCollection(
  sections: GeoJSON.FeatureCollection,
  selectedSectionId: number | null | undefined,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: sections.features.filter(
      (f) => selectedSectionId != null && f.id === selectedSectionId,
    ),
  };
}

/** Where the target ring sits: the selected gauge, else the open feature. */
export function ringTargetFor(
  gaugePins: GaugePin[] | undefined,
  selectedGaugeId: number | null | undefined,
  features: Feature[] | undefined,
  selectedFeatureId: number | null | undefined,
): RingTarget | null {
  const pin = gaugePins?.find((p) => p.id === selectedGaugeId);
  if (pin) return { lon: pin.lon, lat: pin.lat };
  const coords = pointCoords(
    features?.find((f) => f.id === selectedFeatureId)?.location,
  );
  return coords ? { lon: coords[0], lat: coords[1] } : null;
}

/** The sections ticked in picker mode, as one drawable collection. */
export function pickedSectionsCollection(
  sections: SectionWithFeatures[] | undefined,
  ids: Set<number> | undefined,
): GeoJSON.FeatureCollection {
  return buildSectionsGeoJSON((sections ?? []).filter((s) => ids?.has(s.id)));
}

export function areaCircleCollection(
  circle: AreaCircle | null | undefined,
): GeoJSON.FeatureCollection {
  return circle
    ? circleGeoJSON(circle.lat, circle.lon, circle.radiusKm)
    : EMPTY;
}

/** Crosshair while a click places something, else the default. */
export function mapCursor(placing: {
  area: boolean;
  feature: boolean;
  pick: boolean;
}): "crosshair" | undefined {
  return placing.area || placing.feature || placing.pick
    ? "crosshair"
    : undefined;
}
