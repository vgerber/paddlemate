import type { MapScene } from "@/components/canvas/scene";
import type { MapSubject } from "@/components/map/Map";
import { toPseudoFeature } from "@/components/waterway/section-details/utils";
import type {
  Feature,
  FeatureType,
  Proposal,
  SectionWithFeatures,
} from "@/lib/api";
import { lineCoords } from "@/lib/geo";

type Geometry = Feature["location"];
type Position = [number, number];

interface ProposedFeature {
  feature_type: FeatureType;
  metadata?: Record<string, unknown> | null;
  location: Geometry;
  name?: string | null;
  lang_code?: string | null;
}

/** Longest zoom the subject fit may reach; a lone point would otherwise fill
 * the screen with one tile. */
const SUBJECT_MAX_ZOOM = 16;

function positions(value: unknown, out: Position[]): Position[] {
  if (!Array.isArray(value)) return out;
  if (typeof value[0] === "number" && typeof value[1] === "number") {
    out.push([value[0], value[1]]);
  } else {
    for (const part of value) positions(part, out);
  }
  return out;
}

/** Every vertex of a GeoJSON geometry, whatever its type. */
export function geometryPositions(
  geom: Geometry | null | undefined,
): Position[] {
  return positions(geom?.coordinates, []);
}

function boundsOf(points: Position[]): MapSubject["bounds"] | null {
  if (points.length === 0) return null;
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}

interface ProposalMap {
  /** Where the change is today: the stored section or feature. */
  before: Geometry | null;
  sections: SectionWithFeatures[] | undefined;
  features: Feature[] | undefined;
  /** The section line the proposal draws. */
  sectionLine: Position[] | undefined;
  proposedFeatures: Feature[];
}

function proposalMap(
  proposal: Proposal,
  sections: SectionWithFeatures[] | undefined,
): ProposalMap {
  const data = (proposal.proposed_data ?? {}) as Record<string, unknown>;
  const original = (proposal.original_data ?? {}) as Record<string, unknown>;
  const location = data.location as Geometry | undefined;
  const deleting = proposal.operation === "delete";
  const entityId = proposal.entity_id;

  if (proposal.entity_type === "feature") {
    const sectionId = data.section_id ?? original.section_id;
    const parent =
      sections?.find((s) => s.id === sectionId) ??
      sections?.find((s) => s.features.some((f) => f.id === entityId));
    const stored = parent?.features.find((f) => f.id === entityId);
    const proposed: Feature[] = [];
    if (!deleting) {
      if (location && data.feature_type) {
        proposed.push(toPseudoFeature(data as unknown as ProposedFeature, 0));
      } else if (stored) {
        // A rename or a metadata change: the feature stays where it is.
        proposed.push({ ...stored, id: -proposal.id });
      }
    }
    return {
      before: stored?.location ?? null,
      sections: parent ? [parent] : undefined,
      features: parent?.features,
      sectionLine: undefined,
      proposedFeatures: proposed,
    };
  }

  const bundled = Array.isArray(data.features)
    ? (data.features as ProposedFeature[])
    : [];
  const stored =
    proposal.entity_type === "water_section"
      ? sections?.find((s) => s.id === entityId)
      : undefined;
  return {
    before: stored?.location ?? null,
    sections: sections && sections.length > 0 ? sections : undefined,
    features: undefined,
    sectionLine:
      proposal.entity_type === "water_section" && !deleting
        ? (lineCoords(location) ?? undefined)
        : undefined,
    proposedFeatures: deleting ? [] : bundled.map(toPseudoFeature),
  };
}

/** The canvas map for the open proposal: what exists today (the stored
 * section or feature, among its neighbours) in the map's ordinary colours,
 * and the change on top in teal (a line for a section, ghost markers for
 * features). The subject is the union of both, so a moved feature frames the
 * old and the new place. With no proposal open the map is left bare. */
export function buildProposalScene(
  proposal: Proposal | undefined,
  sections: SectionWithFeatures[] | undefined,
): MapScene {
  if (!proposal) return { subject: null };
  const map = proposalMap(proposal, sections);

  const points = [
    ...geometryPositions(map.before),
    ...(map.sectionLine ?? []),
    ...map.proposedFeatures.flatMap((f) => geometryPositions(f.location)),
  ];
  const bounds = boundsOf(points);

  return {
    sections: map.sections,
    features: map.features,
    proposedFeatures:
      map.proposedFeatures.length > 0 ? map.proposedFeatures : undefined,
    drawing: { sectionPreviewCoords: map.sectionLine },
    subject: bounds
      ? {
          // The vertex count changes when the stored side finishes loading,
          // which refits to the union.
          key: `proposal:${proposal.id}:${points.length}`,
          bounds,
          maxZoom: SUBJECT_MAX_ZOOM,
        }
      : null,
  };
}
