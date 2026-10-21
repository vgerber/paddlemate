/** Layer ids the click handlers match; the layer components draw under them. */
export const SECTION_LINE_LAYER = "sections-line";
export const SECTION_CASING_LAYER = "sections-line-casing";
export const SECTION_HITBOX_LAYER = "sections-line-hitbox";
export const SECTION_HIT_LAYERS = [
  SECTION_LINE_LAYER,
  SECTION_CASING_LAYER,
  SECTION_HITBOX_LAYER,
];
export const REGION_FILL_LAYER = "region-browse-fill";
/** A stored put-in or take-out is drawn here, not with the feature points. */
export const SECTION_ENDPOINT_ICON_LAYER = "section-endpoints-icon";
/** Invisible, finger-sized layers over the confirmed features. Points and
 * numbered pins win over a line, which wins over the section under it. */
export const FEATURE_POINT_HIT_LAYERS = [
  "feature-points-hitbox",
  SECTION_ENDPOINT_ICON_LAYER,
  "feature-lines-pin",
];
export const FEATURE_LINE_HIT_LAYERS = ["feature-lines-hitbox"];
export const FEATURE_HIT_LAYERS = [
  ...FEATURE_POINT_HIT_LAYERS,
  ...FEATURE_LINE_HIT_LAYERS,
];
