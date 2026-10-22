import type { DeletedFeature, HistoryStep, Proposal } from "@/lib/api";
import { humanize, sentenceCase } from "@/lib/format";
import { inOrder } from "./steps";

/** The entry an edit belongs to: the section itself or one of its features.
 * A proposed feature has no id yet and cannot be opened. */
export interface EntryRef {
  kind: "section" | "feature";
  id: number | null;
  /** "Big Hole" */
  name: string;
  /** "Hole", or "Section" */
  label: string;
  /** Deleted since; it is no longer in the section, only its history is. */
  gone?: boolean;
}

export function sameEntry(a: EntryRef, b: EntryRef): boolean {
  return a.kind === b.kind && a.id === b.id;
}

export type EditItem =
  | {
      type: "step";
      key: string;
      at: string;
      entry: EntryRef;
      step: HistoryStep;
      /** The approved proposal behind the step, for the reviewer's note. */
      approved?: Proposal;
    }
  | {
      type: "proposal";
      key: string;
      at: string;
      entry: EntryRef;
      proposal: Proposal;
    };

export interface EntryHistory {
  entry: EntryRef;
  steps: HistoryStep[];
}

export interface EntryProposal {
  entry: EntryRef;
  proposal: Proposal;
}

/** Features deleted from a section, as entries whose history can still be
 * opened. A feature the live list still holds is not one. */
export function goneEntries(
  deleted: DeletedFeature[],
  live: EntryRef[],
): EntryRef[] {
  return deleted
    .filter(
      (d) => !live.some((e) => e.kind === "feature" && e.id === d.feature_id),
    )
    .map((d) => {
      const type = d.feature_type
        ? sentenceCase(humanize(d.feature_type))
        : "Feature";
      return {
        kind: "feature",
        id: d.feature_id,
        name: d.name || type,
        label: "Deleted feature",
        gone: true,
      };
    });
}

/** Ties a proposal to the entry it is about. Anything about an entry that is
 * not listed (another section, a feature deleted since) has none. */
export function resolveProposals(
  proposals: Proposal[],
  entries: EntryRef[],
): EntryProposal[] {
  const resolved: EntryProposal[] = [];
  for (const proposal of proposals) {
    if (proposal.entity_type === "waterway") continue;
    const kind = proposal.entity_type === "feature" ? "feature" : "section";
    if (proposal.entity_id == null) {
      // A creation only matters while it is open; once approved the new
      // feature's own history says it.
      if (kind !== "feature" || proposal.operation !== "create") continue;
      if (proposal.status === "approved") continue;
      const data = proposal.proposed_data as { name?: unknown } | null;
      const name = typeof data?.name === "string" ? data.name : "";
      resolved.push({
        entry: { kind, id: null, name: name || "New feature", label: "New" },
        proposal,
      });
      continue;
    }
    const entry = entries.find(
      (e) => e.kind === kind && e.id === proposal.entity_id,
    );
    if (entry) resolved.push({ entry, proposal });
  }
  return resolved;
}

const time = (iso: string) => Date.parse(iso);

function byTime(a: EditItem, b: EditItem): number {
  return time(a.at) - time(b.at) || a.key.localeCompare(b.key);
}

/** Every edit of the given entries in one list, oldest first: the stored
 * steps, rejected proposals among them by their date when `showRejected`,
 * and the open proposals last, as they have not happened yet. */
export function mergeEdits(
  histories: EntryHistory[],
  proposals: EntryProposal[],
  showRejected: boolean,
): { items: EditItem[]; rejected: number } {
  const approved = new Map(
    proposals
      .filter((p) => p.proposal.status === "approved")
      .map((p) => [p.proposal.id, p.proposal]),
  );
  const done: EditItem[] = histories.flatMap(({ entry, steps }) =>
    inOrder(steps).map(
      (step): EditItem => ({
        type: "step",
        key: `step-${entry.kind}-${entry.id}-${step.id}`,
        at: step.at,
        entry,
        step,
        approved:
          step.proposal_id != null ? approved.get(step.proposal_id) : undefined,
      }),
    ),
  );
  const asItem = ({ entry, proposal }: EntryProposal): EditItem => ({
    type: "proposal",
    key: `proposal-${proposal.id}`,
    at: proposal.created_at,
    entry,
    proposal,
  });
  const rejected = proposals.filter((p) => p.proposal.status === "rejected");
  const open = proposals.filter((p) => p.proposal.status === "pending");
  const past = [...done, ...(showRejected ? rejected.map(asItem) : [])].sort(
    byTime,
  );
  return {
    items: [...past, ...open.map(asItem).sort(byTime)],
    rejected: rejected.length,
  };
}
