import { describe, expect, test } from "bun:test";
import type { MaterialTree } from "@/lib/api";
import {
  crumbs,
  nodeId,
  pathPatch,
  selectedTotals,
  treeKey,
  treeRows,
} from "./tree";

const tree: MaterialTree = {
  categories: [
    {
      category: "canoe",
      models: 2,
      entries: 2,
      disciplines: [],
    },
    {
      category: "kayak",
      models: 12,
      entries: 20,
      disciplines: [
        {
          discipline: "creek",
          models: 9,
          entries: 15,
          brands: [
            { brand: "Pyranha", models: 5, entries: 8 },
            { brand: "Dagger", models: 4, entries: 7 },
          ],
        },
        { discipline: "sea", models: 3, entries: 5, brands: [] },
      ],
    },
  ],
};

const none = new Map<string, boolean>();

describe("treeRows", () => {
  test("shows only categories when nothing is selected, in catalogue order", () => {
    const rows = treeRows(tree, {}, none, undefined);
    expect(rows.map((r) => r.label)).toEqual(["Kayaks", "Canoes"]);
    expect(rows[0].expanded).toBe(false);
    expect(rows[1].expandable).toBe(false);
  });

  test("opens the way to the selection", () => {
    const rows = treeRows(
      tree,
      { category: "kayak", discipline: "creek" },
      none,
      undefined,
    );
    expect(rows.map((r) => r.label)).toEqual([
      "Kayaks",
      "Creek",
      "Pyranha",
      "Dagger",
      "Sea",
      "Canoes",
    ]);
    expect(rows.find((r) => r.label === "Creek")?.selected).toBe(true);
  });

  test("a toggle overrides the way to the selection", () => {
    const rows = treeRows(
      tree,
      { category: "kayak", discipline: "creek" },
      new Map([["kayak", false]]),
      undefined,
    );
    expect(rows.map((r) => r.label)).toEqual(["Kayaks", "Canoes"]);
  });

  test("lists the models of the selected brand only", () => {
    const rows = treeRows(
      tree,
      { category: "kayak", discipline: "creek", brand: "pyranha" },
      none,
      [
        {
          category: "kayak",
          brand: "Pyranha",
          model: "Jed",
          variant: null,
          sizes: [
            { id: 7, size: "S" },
            { id: 8, size: "M" },
          ],
        } as never,
      ],
    );
    const leaf = rows.find((r) => r.kind === "model");
    expect(leaf?.label).toBe("Jed");
    expect(leaf?.sizes).toBe("S · M");
    expect(leaf?.modelId).toBe(7);
    expect(leaf?.level).toBe(4);
  });
});

describe("treeKey", () => {
  const rows = treeRows(
    tree,
    { category: "kayak", discipline: "creek" },
    none,
    undefined,
  );
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

describe("paths", () => {
  test("a patch drops the levels below a missing one", () => {
    expect(pathPatch({ discipline: "creek", brand: "x" })).toEqual({
      category: undefined,
      discipline: undefined,
      brand: undefined,
    });
  });
  test("ids and crumbs follow the path", () => {
    expect(nodeId({ category: "kayak", brand: "Pyranha" })).toBe(
      "kayak/pyranha",
    );
    expect(
      crumbs({ category: "kayak", discipline: "creek", brand: "Pyranha" }).map(
        (c) => c.label,
      ),
    ).toEqual(["Kayaks", "Creek", "Pyranha"]);
  });
  test("totals read the selected node", () => {
    expect(selectedTotals(tree, {})).toEqual({ models: 14, entries: 22 });
    expect(
      selectedTotals(tree, {
        category: "kayak",
        discipline: "creek",
        brand: "pyranha",
      }),
    ).toEqual({ models: 5, entries: 8 });
  });
});
