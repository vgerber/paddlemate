import { describe, expect, test } from "bun:test";
import type { Feature } from "@/lib/api";
import {
  isBand,
  isWholeRunGrade,
  memberNames,
  splitWholeRunGrades,
} from "./rows";
import type { ComputedFeature, TreeNode } from "./types";

function cf(
  id: number,
  type: string,
  startM: number,
  endM: number,
  isZone: boolean,
  name = "",
): ComputedFeature {
  return {
    feature: {
      id,
      feature_type: type,
      names: name ? [{ id, feature_id: id, lang_code: "en", name }] : [],
      descriptions: [],
      metadata: {},
    } as unknown as Feature,
    distM: startM,
    startM,
    endM,
    isZone,
    coords: [0, 0],
  };
}

const node = (item: ComputedFeature, nested: TreeNode[] = []): TreeNode => ({
  item,
  nested,
});

describe("isWholeRunGrade", () => {
  test("a whitewater range over the whole run is one", () => {
    expect(isWholeRunGrade(cf(1, "whitewater", 0, 1300, true), 1300)).toBe(
      true,
    );
    expect(isWholeRunGrade(cf(1, "whitewater", 20, 1280, true), 1300)).toBe(
      true,
    );
  });

  test("a partial range, a point or another type is not", () => {
    expect(isWholeRunGrade(cf(1, "whitewater", 300, 500, true), 1300)).toBe(
      false,
    );
    expect(isWholeRunGrade(cf(1, "whitewater", 0, 0, false), 1300)).toBe(false);
    expect(isWholeRunGrade(cf(1, "portage", 0, 1300, true), 1300)).toBe(false);
  });
});

describe("splitWholeRunGrades", () => {
  test("separates the grade bar from the rows", () => {
    const grade = cf(1, "whitewater", 0, 1300, true);
    const hole = cf(2, "hole", 400, 400, false);
    const { grades, rest } = splitWholeRunGrades([grade, hole], 1300);
    expect(grades).toEqual([grade]);
    expect(rest).toEqual([hole]);
  });
});

describe("memberNames", () => {
  test("lists direct and nested members by name", () => {
    const inner = node(cf(3, "hole", 400, 400, false, "Big Hole"));
    const band = node(cf(2, "rapid", 300, 500, true, "Slot"), [
      inner,
      node(cf(4, "rapid", 450, 480, true, "Lip"), [
        node(cf(5, "strainer", 460, 460, false)),
      ]),
    ]);
    expect(memberNames(band)).toEqual(["Big Hole", "Lip", "Strainer"]);
  });
});

describe("isBand", () => {
  test("only a range holding something folds", () => {
    const range = cf(2, "rapid", 300, 500, true);
    expect(isBand(node(range))).toBe(false);
    expect(isBand(node(range, [node(cf(3, "hole", 400, 400, false))]))).toBe(
      true,
    );
    expect(isBand(node(cf(3, "hole", 400, 400, false)))).toBe(false);
  });
});
