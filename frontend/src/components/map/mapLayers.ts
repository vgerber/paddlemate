import type { Feature, SectionWithFeatures } from "@/lib/api";

const FEATURE_COLORS: Record<string, string> = {
  whitewater: "#CC79A7",
  hole: "#D55E00",
  siphon: "#D55E00",
  waterfall: "#56B4E9",
  freestyle_spot: "#F0E442",
  put_in: "#0072B2",
  take_out: "#D55E00",
  portage: "#E69F00",
  weir: "#E69F00",
  dam: "#E69F00",
  obstacle: "#CC79A7",
  bridge: "#bfc8ca",
};

export function buildSectionsGeoJSON(
  sections: SectionWithFeatures[],
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: sections.map((s) => ({
      type: "Feature" as const,
      id: s.id,
      properties: { id: s.id, name: s.name },
      geometry: s.location,
    })),
  };
}

export function buildSectionLabelsGeoJSON(
  sections: SectionWithFeatures[],
  labelMode: "section" | "river",
  waterwayNames?: Record<number, string>,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: sections.flatMap((s) => {
      const geom = s.location as unknown as GeoJSON.LineString;
      if (geom?.type !== "LineString" || !geom.coordinates.length) return [];
      const coords = geom.coordinates;
      const sum = coords.reduce(
        (acc, c) => [acc[0] + c[0], acc[1] + c[1]],
        [0, 0],
      );
      const mid = [sum[0] / coords.length, sum[1] / coords.length];
      const ww = s.features?.find((f) => f.feature_type === "whitewater");
      const diff = (ww?.metadata as Record<string, unknown> | undefined)
        ?.difficulty as string | undefined;
      const riverName = waterwayNames?.[s.waterway_id] ?? s.name;
      const label =
        labelMode === "river"
          ? diff
            ? `${riverName} \u2022 ${diff}`
            : riverName
          : diff
            ? `${s.name} \u2022 ${diff}`
            : s.name;
      return [
        {
          type: "Feature" as const,
          id: s.id,
          properties: { label },
          geometry: { type: "Point" as const, coordinates: mid },
        },
      ];
    }),
  };
}

export function buildSectionEndpointsGeoJSON(
  sections: SectionWithFeatures[],
  sectionLevels?: Record<number, string>,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: sections.flatMap((s) => {
      const geom = s.location as unknown as GeoJSON.LineString;
      if (geom?.type !== "LineString" || !geom.coordinates.length) return [];
      const first = geom.coordinates[0];
      const last = geom.coordinates[geom.coordinates.length - 1];
      return [
        {
          type: "Feature" as const,
          id: s.id * 2,
          properties: {
            kind: "put_in",
            section_id: s.id,
            name: s.name,
            level: sectionLevels?.[s.id] ?? "empty",
          },
          geometry: { type: "Point" as const, coordinates: first },
        },
        {
          type: "Feature" as const,
          id: s.id * 2 + 1,
          properties: {
            kind: "take_out",
            section_id: s.id,
            name: s.name,
            level: sectionLevels?.[s.id] ?? "empty",
          },
          geometry: { type: "Point" as const, coordinates: last },
        },
      ];
    }),
  };
}

export function buildPointFeaturesGeoJSON(
  features: Feature[],
): GeoJSON.FeatureCollection {
  const points = features.filter((f) => f.location.type === "Point");
  return {
    type: "FeatureCollection",
    features: points.map((f) => ({
      type: "Feature" as const,
      id: f.id,
      properties: {
        id: f.id,
        feature_type: f.feature_type,
        label: f.names[0]?.name ?? f.feature_type.replace(/_/g, " "),
        color: FEATURE_COLORS[f.feature_type] ?? "#8bd1e8",
      },
      geometry: f.location as GeoJSON.Point,
    })),
  };
}

export function buildLineFeaturesGeoJSON(
  features: Feature[],
): GeoJSON.FeatureCollection {
  const lines = features.filter((f) => f.location.type === "LineString");
  return {
    type: "FeatureCollection",
    features: lines.map((f) => ({
      type: "Feature" as const,
      id: f.id,
      properties: {
        id: f.id,
        feature_type: f.feature_type,
        color: FEATURE_COLORS[f.feature_type] ?? "#8bd1e8",
      },
      geometry: f.location as GeoJSON.LineString,
    })),
  };
}
