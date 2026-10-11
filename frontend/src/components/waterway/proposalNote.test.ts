import { describe, expect, test } from "bun:test";
import { proposalNoteValue } from "./proposalNote";

describe("proposalNoteValue", () => {
  test("trims the note", () => {
    expect(proposalNoteValue("  see the gauge  ")).toBe("see the gauge");
  });

  test("sends null for an empty or blank note", () => {
    expect(proposalNoteValue("")).toBeNull();
    expect(proposalNoteValue("   ")).toBeNull();
  });
});
