import { describe, expect, test } from "bun:test";
import type { Proposal } from "@/lib/api";
import { proposalChanges } from "./proposalChanges";

const base = {
  id: 1,
  operation: "update",
  entity_type: "feature",
  status: "pending",
  proposed_data: {},
  original_data: {},
} as unknown as Proposal;

describe("proposalChanges", () => {
  test("lists changed fields as before and after", () => {
    const changes = proposalChanges({
      ...base,
      original_data: { name: "Hole", grade: "III" },
      proposed_data: { name: "Big Hole", grade: "III" },
    });
    expect(changes).toEqual([
      { field: "name", before: "Hole", after: "Big Hole" },
    ]);
  });
  test("a moved geometry is a position change without values", () => {
    const changes = proposalChanges({
      ...base,
      original_data: { location: { a: 1 } },
      proposed_data: { location: { a: 2 } },
    });
    expect(changes).toEqual([{ field: "location", before: null, after: null }]);
  });
  test("plumbing fields are left out", () => {
    expect(
      proposalChanges({
        ...base,
        original_data: { section_id: 1 },
        proposed_data: { section_id: 2 },
      }),
    ).toEqual([]);
  });
  test("a deletion has no field changes", () => {
    expect(proposalChanges({ ...base, operation: "delete" })).toEqual([]);
  });
});
