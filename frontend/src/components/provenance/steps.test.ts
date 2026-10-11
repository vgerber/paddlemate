import { describe, expect, test } from "bun:test";
import type { HistoryStep } from "@/lib/api";
import {
  fieldLabel,
  inOrder,
  isGeometryChange,
  stepByline,
  stepHeadline,
} from "./steps";

const base: HistoryStep = {
  id: 1,
  at: "2026-01-01T00:00:00Z",
  kind: "edited",
  actor: { user_id: "u", username: "mara" },
  source: null,
  proposal_id: null,
  reviewer: null,
  changes: [],
};

const source = {
  id: "1",
  name: "Rivermap Alpine Rivers",
  short_name: "Rivermap",
  website: null,
  license_name: null,
  license_url: null,
};

describe("stepHeadline", () => {
  test("an import names its source", () => {
    expect(
      stepHeadline({ ...base, kind: "imported", actor: null, source }),
    ).toBe("Imported from Rivermap");
  });
  test("a creation names the user", () => {
    expect(stepHeadline({ ...base, kind: "created" })).toBe("Added by mara");
  });
  test("an edit and an accepted proposal both say changed", () => {
    expect(stepHeadline(base)).toBe("Changed by mara");
    expect(stepHeadline({ ...base, kind: "proposal_accepted" })).toBe(
      "Changed by mara",
    );
  });
  test("a deletion says so", () => {
    expect(stepHeadline({ ...base, kind: "deleted" })).toBe("Deleted by mara");
    expect(stepHeadline({ ...base, kind: "deleted", actor: null })).toBe(
      "Deleted",
    );
  });
});

describe("stepByline", () => {
  test("names the reviewer of an accepted proposal", () => {
    expect(
      stepByline({
        ...base,
        kind: "proposal_accepted",
        proposal_id: 7,
        reviewer: { user_id: "r", username: "vincent" },
      }),
    ).toBe("approved by vincent");
  });
  test("a deleting proposal names its reviewer too", () => {
    expect(
      stepByline({
        ...base,
        kind: "deleted",
        proposal_id: 7,
        reviewer: { user_id: "r", username: "vincent" },
      }),
    ).toBe("approved by vincent");
  });
  test("is empty otherwise", () => {
    expect(stepByline(base)).toBeNull();
  });
});

describe("fieldLabel", () => {
  test("sentence case from the api name", () => {
    expect(fieldLabel("feature_type")).toBe("Feature type");
    expect(fieldLabel("name")).toBe("Name");
  });
  test("location reads as position", () => {
    expect(fieldLabel("location")).toBe("Position");
  });
});

describe("isGeometryChange", () => {
  test("is a change with no values", () => {
    expect(
      isGeometryChange({ field: "location", before: null, after: null }),
    ).toBe(true);
    expect(isGeometryChange({ field: "name", before: null, after: "x" })).toBe(
      false,
    );
  });
});

describe("inOrder", () => {
  test("puts the oldest step first", () => {
    const late = { ...base, id: 2, at: "2026-02-01T00:00:00Z" };
    expect(inOrder([late, base]).map((s) => s.id)).toEqual([1, 2]);
  });
});
