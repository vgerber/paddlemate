import { describe, expect, test } from "bun:test";
import type { HistoryStep } from "@/lib/api";
import {
  changeValue,
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
  test("an origin without a source says so", () => {
    expect(stepHeadline({ ...base, kind: "imported", actor: null })).toBe(
      "Origin not recorded",
    );
    expect(stepHeadline({ ...base, kind: "created", actor: null })).toBe(
      "Origin not recorded",
    );
  });
  test("a creation is added, the user is the by-line's", () => {
    expect(stepHeadline({ ...base, kind: "created" })).toBe("Added");
  });
  test("an edit and an accepted proposal both say changed", () => {
    expect(stepHeadline(base)).toBe("Changed");
    expect(stepHeadline({ ...base, kind: "proposal_accepted" })).toBe(
      "Changed",
    );
  });
  test("a deletion says so", () => {
    expect(stepHeadline({ ...base, kind: "deleted" })).toBe("Deleted");
  });
});

const text = (parts: { text: string }[]) => parts.map((p) => p.text).join("");

describe("stepByline", () => {
  const reviewer = { user_id: "r", username: "vincent" };
  test("an accepted proposal names who proposed and who approved", () => {
    const parts = stepByline({
      ...base,
      kind: "proposal_accepted",
      proposal_id: 7,
      reviewer,
    });
    expect(text(parts)).toBe("Proposed by mara, approved by vincent");
    expect(parts.filter((p) => p.name).map((p) => p.text)).toEqual([
      "mara",
      "vincent",
    ]);
  });
  test("a deleting proposal names both too", () => {
    expect(
      text(stepByline({ ...base, kind: "deleted", proposal_id: 7, reviewer })),
    ).toBe("Proposed by mara, approved by vincent");
  });
  test("a direct edit names the user", () => {
    expect(text(stepByline(base))).toBe("by mara");
  });
  test("an import has no by-line", () => {
    expect(stepByline({ ...base, kind: "imported", actor: null })).toEqual([]);
  });
});

describe("fieldLabel", () => {
  test("sentence case from the api name", () => {
    expect(fieldLabel("feature_type")).toBe("Type");
    expect(fieldLabel("water_range_9401")).toBe("Water range 9401");
    expect(fieldLabel("name")).toBe("Name");
  });
  test("location reads as position", () => {
    expect(fieldLabel("location")).toBe("Position");
  });
});

describe("changeValue", () => {
  test("an enum value reads as a word", () => {
    expect(changeValue("feature_type", "rapid")).toBe("Rapid");
    expect(changeValue("feature_type", "put_in")).toBe("Put in");
  });
  test("other values stay as written", () => {
    expect(changeValue("name", "old weir")).toBe("old weir");
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
