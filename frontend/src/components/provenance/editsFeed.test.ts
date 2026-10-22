import { describe, expect, test } from "bun:test";
import type { HistoryStep, Proposal } from "@/lib/api";
import {
  type EntryRef,
  goneEntries,
  mergeEdits,
  resolveProposals,
  sameEntry,
} from "./editsFeed";

const section: EntryRef = {
  kind: "section",
  id: 1,
  name: "Lower Test",
  label: "Section",
};
const hole: EntryRef = { kind: "feature", id: 7, name: "Hole", label: "Hole" };

const step = (id: number, at: string, over: Partial<HistoryStep> = {}) =>
  ({
    id,
    at,
    kind: "edited",
    actor: null,
    source: null,
    proposal_id: null,
    reviewer: null,
    changes: [],
    ...over,
  }) as HistoryStep;

const proposal = (id: number, over: Record<string, unknown> = {}) =>
  ({
    id,
    entity_type: "feature",
    entity_id: 7,
    operation: "update",
    proposed_data: {},
    status: "pending",
    created_at: "2026-03-01T00:00:00Z",
    ...over,
  }) as unknown as Proposal;

describe("resolveProposals", () => {
  test("ties proposals to their entry and drops unknown ones", () => {
    const out = resolveProposals(
      [
        proposal(1),
        proposal(2, { entity_id: 99 }),
        proposal(3, { entity_type: "water_section", entity_id: 1 }),
        proposal(4, { entity_type: "waterway", entity_id: 1 }),
      ],
      [section, hole],
    );
    expect(out.map((o) => [o.proposal.id, o.entry.name])).toEqual([
      [1, "Hole"],
      [3, "Lower Test"],
    ]);
  });

  test("an open creation is a new, unopenable entry named by the proposal", () => {
    const out = resolveProposals(
      [
        proposal(5, {
          entity_id: null,
          operation: "create",
          proposed_data: { name: "Wave" },
        }),
        proposal(6, {
          entity_id: null,
          operation: "create",
          status: "approved",
        }),
      ],
      [section, hole],
    );
    expect(out).toHaveLength(1);
    expect(out[0].entry).toEqual({
      kind: "feature",
      id: null,
      name: "Wave",
      label: "New",
    });
  });
});

describe("mergeEdits", () => {
  const histories = [
    {
      entry: section,
      steps: [step(1, "2026-01-01T00:00:00Z", { kind: "imported" })],
    },
    {
      entry: hole,
      steps: [
        step(2, "2026-02-01T00:00:00Z"),
        step(3, "2026-01-15T00:00:00Z", { kind: "created" }),
      ],
    },
  ];

  test("steps of all entries run oldest first", () => {
    const { items } = mergeEdits(histories, [], false);
    expect(items.map((i) => i.type === "step" && i.step.id)).toEqual([1, 3, 2]);
  });

  test("open proposals come last, rejected ones only when asked for", () => {
    const props = resolveProposals(
      [
        proposal(10, {
          created_at: "2026-01-20T00:00:00Z",
          status: "rejected",
        }),
        proposal(11, { created_at: "2025-12-01T00:00:00Z" }),
      ],
      [section, hole],
    );
    const hidden = mergeEdits(histories, props, false);
    expect(hidden.rejected).toBe(1);
    expect(hidden.items.at(-1)?.key).toBe("proposal-11");
    expect(hidden.items.some((i) => i.key === "proposal-10")).toBe(false);
    const shown = mergeEdits(histories, props, true);
    expect(shown.items.map((i) => i.key)).toEqual([
      "step-section-1-1",
      "step-feature-7-3",
      "proposal-10",
      "step-feature-7-2",
      "proposal-11",
    ]);
  });

  test("an accepted step carries its approved proposal", () => {
    const props = resolveProposals(
      [proposal(20, { status: "approved", review_note: "ok" })],
      [hole],
    );
    const { items } = mergeEdits(
      [
        {
          entry: hole,
          steps: [step(9, "2026-02-01T00:00:00Z", { proposal_id: 20 })],
        },
      ],
      props,
      false,
    );
    const first = items[0];
    expect(first.type === "step" && first.approved?.review_note).toBe("ok");
  });
});

describe("sameEntry", () => {
  test("compares kind and id", () => {
    expect(sameEntry(hole, { ...hole, name: "x" })).toBe(true);
    expect(sameEntry(hole, section)).toBe(false);
  });
});

describe("goneEntries", () => {
  const removal = (over: Record<string, unknown> = {}) =>
    proposal(9, {
      entity_id: 8,
      operation: "delete",
      status: "approved",
      original_data: { section_id: 1, feature_type: "weir" },
      ...over,
    });

  test("an approved delete of an unlisted feature is a gone entry", () => {
    expect(goneEntries(1, [removal()], [section, hole])).toEqual([
      {
        kind: "feature",
        id: 8,
        name: "Weir",
        label: "Deleted feature",
        gone: true,
      },
    ]);
  });

  test("its own name wins over the type", () => {
    const [entry] = goneEntries(
      1,
      [removal({ original_data: { section_id: 1, name: "Big weir" } })],
      [section],
    );
    expect(entry.name).toBe("Big weir");
  });

  test("open, rejected, listed and non-delete proposals are ignored", () => {
    const others = [
      removal({ status: "pending" }),
      removal({ status: "rejected" }),
      removal({ entity_id: 7 }),
      removal({ operation: "update" }),
      removal({ entity_type: "water_section" }),
      removal({ original_data: { section_id: 2 } }),
    ];
    expect(goneEntries(1, others, [section, hole])).toEqual([]);
  });

  test("one entry per feature", () => {
    expect(goneEntries(1, [removal(), removal()], [section])).toHaveLength(1);
  });
});
