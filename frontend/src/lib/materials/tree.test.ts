import { describe, expect, test } from "bun:test";
import type { MaterialTree } from "@/lib/api";
import {
  browseLabel,
  crumbs,
  nodeId,
  pathPatch,
  selectedTotals,
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

describe("browseLabel", () => {
  test("says All gear without a path, else the path levels", () => {
    expect(browseLabel({})).toBe("All gear");
    expect(browseLabel({ category: "kayak", discipline: "creek" })).toBe(
      "Kayaks \u00b7 Creek",
    );
  });
});

const withUses: MaterialTree = {
  categories: [
    {
      category: "kayak",
      models: 8,
      entries: 10,
      disciplines: [],
      uses: [
        {
          use: "whitewater",
          models: 6,
          entries: 8,
          disciplines: [
            {
              discipline: "creek",
              models: 5,
              entries: 6,
              brands: [{ brand: "Pyranha", models: 5, entries: 6 }],
            },
          ],
        },
        { use: "racing", models: 2, entries: 2, disciplines: [] },
      ],
    },
    { category: "paddle", models: 3, entries: 3, disciplines: [] },
  ],
};

describe("kayak uses", () => {
  test("a use sits between the category and its groups", () => {
    const rows = treeRows(
      withUses,
      { category: "kayak", use: "whitewater", discipline: "creek" },
      none,
      undefined,
    );
    expect(rows.map((r) => [r.kind, r.level, r.label])).toEqual([
      ["category", 1, "Kayaks"],
      ["use", 2, "Whitewater"],
      ["discipline", 3, "Creek"],
      ["brand", 4, "Pyranha"],
      ["use", 2, "Racing"],
      ["category", 1, "Paddles"],
    ]);
  });

  test("an older link without a use finds it in the tree", () => {
    const rows = treeRows(
      withUses,
      { category: "kayak", discipline: "creek" },
      none,
      undefined,
    );
    expect(rows.find((r) => r.label === "Creek")?.selected).toBe(true);
    expect(
      crumbs({ category: "kayak", discipline: "creek" }, withUses).map(
        (c) => c.label,
      ),
    ).toEqual(["Kayaks", "Whitewater", "Creek"]);
  });

  test("labels and totals follow the use", () => {
    expect(
      browseLabel(
        { category: "kayak", use: "whitewater", discipline: "creek" },
        withUses,
      ),
    ).toBe("Kayaks \u00b7 Whitewater \u00b7 Creek");
    expect(
      selectedTotals(withUses, { category: "kayak", use: "whitewater" }),
    ).toEqual({ models: 6, entries: 8 });
    expect(selectedTotals(withUses, { category: "kayak" })).toEqual({
      models: 8,
      entries: 10,
    });
  });

  test("selecting a use clears the levels below it", () => {
    expect(nodeId({ category: "kayak", use: "racing" })).toBe("kayak/racing");
    expect(pathPatch({ category: "kayak", use: "racing", brand: "X" })).toEqual(
      {
        category: "kayak",
        use: "racing",
        discipline: undefined,
        brand: undefined,
      },
    );
  });
});
