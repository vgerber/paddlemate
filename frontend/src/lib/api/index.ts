import { apiFetch } from "./client";

// ---------------------------------------------------------------------------
// Types (mirroring the Rust API models)
// ---------------------------------------------------------------------------

export interface Waterway {
  id: number;
  waterway_type: "river";
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface WaterwayWithSections extends Waterway {
  sections: Section[];
}

export interface Section {
  id: number;
  waterway_id: number;
  name: string;
  description?: string;
  location: GeoJSON.LineString;
  created_at: string;
  updated_at: string;
}

export interface SectionWithFeatures extends Section {
  features: Feature[];
}

export type FeatureType =
  | "whitewater"
  | "freestyle_spot"
  | "hole"
  | "siphon"
  | "weir"
  | "dam"
  | "obstacle"
  | "bridge"
  | "portage"
  | "put_in"
  | "take_out"
  | "waterfall";

export interface FeatureName {
  id: number;
  feature_id: number;
  lang_code: string;
  name: string;
}

export interface FeatureDescription {
  id: number;
  feature_id: number;
  lang_code: string;
  description: string;
}

export interface Feature {
  id: number;
  section_id: number;
  feature_type: FeatureType;
  metadata: Record<string, unknown>;
  location: GeoJSON.Point | GeoJSON.LineString | GeoJSON.Polygon;
  names: FeatureName[];
  descriptions: FeatureDescription[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: number;
  entity_type: "water_section" | "feature";
  entity_id: number;
  body: string;
  author_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreateFeatureInput {
  feature_type: FeatureType;
  metadata?: Record<string, unknown>;
  location: GeoJSON.Point;
}

// ---------------------------------------------------------------------------
// Waterways
// ---------------------------------------------------------------------------

export const waterwaysApi = {
  list: () => apiFetch<Waterway[]>("GET", "/waterways"),
  get: (id: number) => apiFetch<WaterwayWithSections>("GET", `/waterways/${id}`),
};

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export const sectionsApi = {
  get: (waterwayId: number, sectionId: number) =>
    apiFetch<SectionWithFeatures>(
      "GET",
      `/waterways/${waterwayId}/sections/${sectionId}`,
    ),
};

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export const commentsApi = {
  listForSection: (waterwayId: number, sectionId: number) =>
    apiFetch<Comment[]>(
      "GET",
      `/waterways/${waterwayId}/sections/${sectionId}/comments`,
    ),
  createForSection: (waterwayId: number, sectionId: number, body: string) =>
    apiFetch<Comment>(
      "POST",
      `/waterways/${waterwayId}/sections/${sectionId}/comments`,
      { body },
    ),
};

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

export const featuresApi = {
  get: (waterwayId: number, sectionId: number, featureId: number) =>
    apiFetch<Feature>(
      "GET",
      `/waterways/${waterwayId}/sections/${sectionId}/features/${featureId}`,
    ),
  create: (waterwayId: number, sectionId: number, data: CreateFeatureInput) =>
    apiFetch<Feature>(
      "POST",
      `/waterways/${waterwayId}/sections/${sectionId}/features`,
      data,
    ),
};
