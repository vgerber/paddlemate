// Hand-written from .claude/handoffs/2026-10-11-provenance-contract.md.
// To be replaced by the generated API types once the history and sources
// routes are in the schema.

export interface ProvenanceUser {
  user_id: string;
  username: string;
}

export interface ProvenanceSource {
  id: number;
  name: string;
  short_name: string;
  website: string | null;
  license_name: string | null;
  license_url: string | null;
}

export type HistoryKind =
  | "imported"
  | "created"
  | "proposal_accepted"
  | "edited"
  | "deleted";

export interface HistoryChange {
  field: string;
  before: string | null;
  after: string | null;
}

export interface HistoryStep {
  id: number;
  at: string;
  kind: HistoryKind;
  actor: ProvenanceUser | null;
  source: ProvenanceSource | null;
  proposal_id: number | null;
  reviewer: ProvenanceUser | null;
  changes: HistoryChange[];
}

export interface HistoryPage {
  items: HistoryStep[];
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface SourcesSummary {
  sources: { source: ProvenanceSource; entries: number }[];
  contributors: { user: ProvenanceUser; steps: number; last_at: string }[];
}

/** Whose history: a river, one of its sections, or one feature. */
export type HistoryTarget =
  | { waterwayId: number }
  | { waterwayId: number; sectionId: number }
  | { waterwayId: number; sectionId: number; featureId: number };
