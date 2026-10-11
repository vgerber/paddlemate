import type { Proposal, ProposalStatus } from "@/lib/api";

/** The status as a reader says it: an approved proposal is "Accepted". */
export const STATUS_LABEL: Record<ProposalStatus, string> = {
  pending: "Pending",
  approved: "Accepted",
  rejected: "Rejected",
};

/** "Create · Feature": what the proposal does, to what. */
export function kindLine(
  operation: string,
  entityType: string,
  labels: { op: Record<string, string>; entity: Record<string, string> },
): string {
  return `${labels.op[operation] ?? operation} · ${labels.entity[entityType] ?? entityType}`;
}

/** A proposal with the usernames the API adds next to the ids. */
export type ProposalWithNames = Proposal & {
  submitted_by_name?: string | null;
  reviewed_by_name?: string | null;
};

/** Who decided it, for the line under the proposer: "Accepted by anna".
 * Empty while pending or when the API names no one. */
export function reviewerLine(proposal: ProposalWithNames): string | null {
  if (proposal.status === "pending") return null;
  const who = proposal.reviewed_by_name || proposal.reviewed_by;
  if (!who) return null;
  return `${STATUS_LABEL[proposal.status]} by ${who}`;
}

/** Who proposed it: the username when the API sent one, "you" for the
 * reader's own, else the id as before. */
export function proposerName(
  proposal: Pick<Proposal, "submitted_by"> & {
    submitted_by_name?: string | null;
  },
  currentUserId?: string,
): string {
  if (currentUserId && proposal.submitted_by === currentUserId) return "you";
  return proposal.submitted_by_name || proposal.submitted_by;
}

/** Fields that are plumbing, not content, in an update's before/after rows. */
export const DIFF_HIDDEN_KEYS = new Set([
  "geometry",
  "water_ranges",
  "location",
  "waterway_id",
  "section_id",
  "feature_id",
  "lang_code",
]);
