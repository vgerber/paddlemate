import { describe, expect, test } from "bun:test";
import { escapeGoesBack, matchRow, pushRow, type RowKey } from "./keys";

const base = {
  key: "Escape",
  defaultPrevented: false,
  inside: true,
  inField: false,
  fieldFilled: false,
  popupOpen: false,
};

describe("escapeGoesBack", () => {
  test("plain Escape inside the card goes back", () => {
    expect(escapeGoesBack(base)).toBe(true);
  });
  test("other keys do not", () => {
    expect(escapeGoesBack({ ...base, key: "Enter" })).toBe(false);
  });
  test("a handled event does not", () => {
    expect(escapeGoesBack({ ...base, defaultPrevented: true })).toBe(false);
  });
  test("an event from a portal does not", () => {
    expect(escapeGoesBack({ ...base, inside: false })).toBe(false);
  });
  test("a filled field keeps Escape, an empty one does not", () => {
    expect(escapeGoesBack({ ...base, inField: true, fieldFilled: true })).toBe(
      false,
    );
    expect(escapeGoesBack({ ...base, inField: true })).toBe(true);
  });
  test("an open popup keeps Escape", () => {
    expect(escapeGoesBack({ ...base, popupOpen: true })).toBe(false);
  });
});

describe("rows", () => {
  const a: RowKey = { testId: "r", text: "Isar" };
  const b = { testId: "r", text: "Inn" };
  test("matchRow needs the same id and text", () => {
    const list = [{ key: b }, { key: a }];
    expect(matchRow(list, a)).toBe(list[1]);
    expect(matchRow(list, { testId: "x", text: "Isar" })).toBeUndefined();
  });
  test("pushRow skips an immediate repeat and caps the depth", () => {
    expect(pushRow([a], a)).toEqual([a]);
    let s = [a];
    for (let i = 0; i < 20; i++) s = pushRow(s, { testId: null, text: `${i}` });
    expect(s.length).toBeLessThanOrEqual(10);
  });
});
