import type { Feature, SectionWithFeatures } from "@/lib/api";
import { representativePoint } from "@/lib/geo";
import { localizedName } from "@/lib/localization";
import { theme } from "@/lib/theme";

export const FEATURE_COLORS: Record<string, string> =
  theme.tokens.featureColors;

function nearestPointOnSegment(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): [number, number] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return a;
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq),
  );
  return [a[0] + t * dx, a[1] + t * dy];
}

function nearestPointOnPolyline(
  point: [number, number],
  line: [number, number][],
): [number, number] {
  let best = line[0] as [number, number];
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < line.length - 1; i++) {
    const c = nearestPointOnSegment(
      point,
      line[i] as [number, number],
      line[i + 1] as [number, number],
    );
    const d = Math.hypot(c[0] - point[0], c[1] - point[1]);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

/** Feature difficulty from metadata, if set. */
function featureDifficulty(f: Feature): string | undefined {
  return (f.metadata as Record<string, unknown> | null)?.difficulty as
    | string
    | undefined;
}

/** Map label: "Name (III+)", name or difficulty alone, or "" when neither. */
function featureLabel(f: Feature): string {
  const name = f.names[0]?.name;
  const difficulty = featureDifficulty(f);
  if (name) return difficulty ? `${name} (${difficulty})` : name;
  return difficulty ?? "";
}

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

/**
 * Section labels for the map. `language` is taken as an argument rather than
 * read from the preference, because callers memoize the result: an implicit
 * read would leave the map showing the previous language's labels, and nothing
 * would flag the missing dependency.
 */
export function buildSectionLabelsGeoJSON(
  sections: SectionWithFeatures[],
  labelMode: "section" | "river",
  waterwayNames: Record<number, string> | undefined,
  language: string,
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
      const sectionName = localizedName(s.name, s.names, language);
      const riverName = waterwayNames?.[s.waterway_id] ?? sectionName;
      const label =
        labelMode === "river"
          ? diff
            ? `${riverName} \u2022 ${diff}`
            : riverName
          : diff
            ? `${sectionName} \u2022 ${diff}`
            : sectionName;
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
      const level = sectionLevels?.[s.id] ?? "empty";
      const commonProps = { section_id: s.id, name: s.name, level };

      const storedPutIns = (s.features ?? []).filter(
        (f) => f.feature_type === "put_in" && f.location.type === "Point",
      );
      const storedTakeOuts = (s.features ?? []).filter(
        (f) => f.feature_type === "take_out" && f.location.type === "Point",
      );

      const putInPoints: GeoJSON.Feature[] =
        storedPutIns.length > 0
          ? storedPutIns.map((f) => ({
              type: "Feature" as const,
              id: f.id,
              properties: { ...commonProps, kind: "put_in", feature_id: f.id },
              geometry: f.location as GeoJSON.Point,
            }))
          : [
              {
                type: "Feature" as const,
                id: s.id * 2,
                properties: { ...commonProps, kind: "put_in" },
                geometry: {
                  type: "Point" as const,
                  coordinates: geom.coordinates[0],
                },
              },
            ];

      const takeOutPoints: GeoJSON.Feature[] =
        storedTakeOuts.length > 0
          ? storedTakeOuts.map((f) => ({
              type: "Feature" as const,
              id: f.id,
              properties: {
                ...commonProps,
                kind: "take_out",
                feature_id: f.id,
              },
              geometry: f.location as GeoJSON.Point,
            }))
          : [
              {
                type: "Feature" as const,
                id: s.id * 2 + 1,
                properties: { ...commonProps, kind: "take_out" },
                geometry: {
                  type: "Point" as const,
                  coordinates: geom.coordinates[geom.coordinates.length - 1],
                },
              },
            ];

      return [...putInPoints, ...takeOutPoints];
    }),
  };
}

export function buildPutInTakeOutConnectorsGeoJSON(
  sections: SectionWithFeatures[],
): GeoJSON.FeatureCollection {
  const connectors: GeoJSON.Feature[] = [];
  for (const s of sections) {
    const geom = s.location as unknown as GeoJSON.LineString;
    if (geom?.type !== "LineString" || geom.coordinates.length < 2) continue;
    const line = geom.coordinates as [number, number][];
    const accessPoints = (s.features ?? []).filter(
      (f) =>
        (f.feature_type === "put_in" || f.feature_type === "take_out") &&
        f.location.type === "Point",
    );
    for (const ap of accessPoints) {
      const pt = (ap.location as GeoJSON.Point).coordinates as [number, number];
      const nearest = nearestPointOnPolyline(pt, line);
      // Skip if point is essentially on the section line (~10 m threshold)
      if (Math.hypot(nearest[0] - pt[0], nearest[1] - pt[1]) < 0.0001) continue;
      connectors.push({
        type: "Feature" as const,
        id: ap.id,
        properties: {
          feature_type: ap.feature_type,
          color: FEATURE_COLORS[ap.feature_type] ?? theme.tokens.outline,
        },
        geometry: {
          type: "LineString" as const,
          coordinates: [pt, nearest],
        },
      });
    }
  }
  return { type: "FeatureCollection", features: connectors };
}

export function buildPointFeaturesGeoJSON(
  features: Feature[],
): GeoJSON.FeatureCollection {
  const points = features.filter(
    (f) =>
      f.location.type === "Point" &&
      f.feature_type !== "put_in" &&
      f.feature_type !== "take_out",
  );
  return {
    type: "FeatureCollection",
    features: points.map((f) => ({
      type: "Feature" as const,
      id: f.id,
      properties: {
        id: f.id,
        feature_type: f.feature_type,
        label: featureLabel(f) || f.feature_type.replace(/_/g, " "),
        color: FEATURE_COLORS[f.feature_type] ?? theme.tokens.primary,
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
    features: lines.map((f, index) => ({
      type: "Feature" as const,
      id: f.id,
      properties: {
        id: f.id,
        feature_type: f.feature_type,
        label: featureLabel(f),
        // Sideways offset step so overlapping lines stay distinguishable
        stack: index,
        color: FEATURE_COLORS[f.feature_type] ?? theme.tokens.primary,
      },
      geometry: f.location as GeoJSON.LineString,
    })),
  };
}

/** Point-style name labels for line/area features, anchored at the
 * geometry's midpoint so they are as easy to spot as point features. */
export function buildLineFeatureLabelsGeoJSON(
  features: Feature[],
): GeoJSON.FeatureCollection {
  const lines = features.filter(
    (f) => f.location.type === "LineString" || f.location.type === "Polygon",
  );
  return {
    type: "FeatureCollection",
    features: lines.flatMap((f) => {
      const label = featureLabel(f);
      if (!label) return [];
      return [
        {
          type: "Feature" as const,
          properties: { label },
          geometry: {
            type: "Point" as const,
            coordinates: representativePoint(
              f.location as GeoJSON.LineString | GeoJSON.Polygon,
            ),
          },
        },
      ];
    }),
  };
}

/** Small start/end dots for line features, delimiting each stretch. */
export function buildLineFeatureEndpointsGeoJSON(
  features: Feature[],
): GeoJSON.FeatureCollection {
  const lines = features.filter((f) => f.location.type === "LineString");
  return {
    type: "FeatureCollection",
    features: lines.flatMap((f) => {
      const coords = (f.location as GeoJSON.LineString).coordinates;
      if (coords.length < 2) return [];
      const color = FEATURE_COLORS[f.feature_type] ?? theme.tokens.primary;
      return [coords[0], coords[coords.length - 1]].map((c) => ({
        type: "Feature" as const,
        properties: { color },
        geometry: { type: "Point" as const, coordinates: c },
      }));
    }),
  };
}

/** GeoJSON for proposed (pending) point features - rendered with outline-only circles. */
export function buildProposedPointFeaturesGeoJSON(
  features: Feature[],
): GeoJSON.FeatureCollection {
  const points = features.filter(
    (f) =>
      f.location.type === "Point" &&
      f.feature_type !== "put_in" &&
      f.feature_type !== "take_out",
  );
  return {
    type: "FeatureCollection",
    features: points.map((f) => ({
      type: "Feature" as const,
      id: f.id,
      properties: {
        id: f.id,
        label: featureLabel(f) || f.feature_type.replace(/_/g, " "),
        color: FEATURE_COLORS[f.feature_type] ?? theme.tokens.primary,
      },
      geometry: f.location as GeoJSON.Point,
    })),
  };
}

/** GeoJSON for proposed (pending) line and area features (areas render as
 * outlines). */
export function buildProposedLineFeaturesGeoJSON(
  features: Feature[],
): GeoJSON.FeatureCollection {
  const lines = features.filter(
    (f) => f.location.type === "LineString" || f.location.type === "Polygon",
  );
  return {
    type: "FeatureCollection",
    features: lines.map((f, index) => ({
      type: "Feature" as const,
      id: f.id,
      properties: {
        id: f.id,
        label: featureLabel(f),
        // Sideways offset step so overlapping lines stay distinguishable
        stack: index,
        color: FEATURE_COLORS[f.feature_type] ?? theme.tokens.primary,
      },
      geometry: f.location as GeoJSON.LineString | GeoJSON.Polygon,
    })),
  };
}
