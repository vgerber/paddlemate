import { describe, expect, test } from "bun:test";
import { type TreeNode, treeKey } from "./treeKeys";

const node = (
  id: string,
  label: string,
  level: number,
  parentId?: string,
  open?: boolean,
): TreeNode => ({
  id,
  label,
  level,
  parentId,
  expandable: open != null,
  expanded: open === true,
  selected: false,
});

describe("treeKey", () => {
  const rows = [
    node("kayak", "Kayaks", 1, undefined, true),
    node("kayak/creek", "Creek", 2, "kayak", true),
    node("kayak/creek/dagger", "Dagger", 3, "kayak/creek"),
    node("kayak/sea", "Sea", 2, "kayak"),
    node("canoe", "Canoes", 1, undefined, false),
  ];
  test("arrows walk the visible rows", () => {
    expect(treeKey(rows, "kayak", "ArrowDown")).toEqual({
      type: "focus",
      id: "kayak/creek",
    });
    expect(treeKey(rows, "kayak", "ArrowUp")).toBeNull();
    expect(treeKey(rows, "kayak", "End")).toEqual({
      type: "focus",
      id: "canoe",
    });
    expect(treeKey(rows, "canoe", "Home")).toEqual({
      type: "focus",
      id: "kayak",
    });
  });
  test("right opens, then enters; left closes, then climbs", () => {
    expect(treeKey(rows, "kayak/sea", "ArrowRight")).toBeNull();
    expect(treeKey(rows, "kayak", "ArrowRight")).toEqual({
      type: "focus",
      id: "kayak/creek",
    });
    expect(treeKey(rows, "kayak", "ArrowLeft")).toEqual({
      type: "toggle",
      id: "kayak",
      open: false,
    });
    expect(treeKey(rows, "kayak/sea", "ArrowLeft")).toEqual({
      type: "focus",
      id: "kayak",
    });
  });
  test("a letter jumps to the next row that starts with it", () => {
    expect(treeKey(rows, "kayak", "d")).toEqual({
      type: "focus",
      id: "kayak/creek/dagger",
    });
  });
  test("enter activates", () => {
    expect(treeKey(rows, "kayak", "Enter")).toEqual({
      type: "activate",
      id: "kayak",
    });
  });
});
