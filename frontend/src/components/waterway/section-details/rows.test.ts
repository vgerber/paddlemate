import { describe, expect, test } from "bun:test";
import type { Feature } from "@/lib/api";
import {
  countLabel,
  isBand,
  memberNames,
  splitBaseGrade,
  stripShown,
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

describe("splitBaseGrade", () => {
  const graded = (id: number, start: number, end: number, grade: string) => {
    const item = cf(id, "whitewater", start, end, true);
    (item.feature.metadata as Record<string, unknown>).difficulty = grade;
    return item;
  };

  test("takes the grade covering 80 percent or more out of the rows", () => {
    const grade = graded(1, 0, 1100, "III");
    const hole = cf(2, "hole", 400, 400, false);
    const { grade: base, rest } = splitBaseGrade([grade, hole], 1300);
    expect(base).toBe(grade);
    expect(rest).toEqual([hole]);
  });

  test("a range below 80 percent stays a row", () => {
    const part = graded(1, 0, 1000, "III");
    expect(splitBaseGrade([part], 1300)).toEqual({ grade: null, rest: [part] });
  });

  test("a range without a grade, a point or another type is no grade", () => {
    const bare = cf(1, "whitewater", 0, 1300, true);
    const portage = cf(2, "portage", 0, 1300, true);
    expect(splitBaseGrade([bare, portage], 1300).grade).toBeNull();
  });

  test("the harder stretch stays a row", () => {
    const base = graded(1, 0, 1300, "III");
    const hard = graded(2, 300, 500, "IV");
    const { grade, rest } = splitBaseGrade([base, hard], 1300);
    expect(grade).toBe(base);
    expect(rest).toEqual([hard]);
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

describe("stripShown", () => {
  const putIn = cf(1, "put_in", 0, 0, false);
  const takeOut = cf(2, "take_out", 1300, 1300, false);
  const rapid = cf(3, "rapid", 400, 400, false);

  test("hidden for no rows, a single row, or the access points only", () => {
    expect(stripShown([])).toBe(false);
    expect(stripShown([rapid])).toBe(false);
    expect(stripShown([putIn, takeOut])).toBe(false);
  });

  test("shown once there is more than the access points", () => {
    expect(stripShown([putIn, takeOut, rapid])).toBe(true);
    expect(stripShown([rapid, cf(4, "weir", 900, 900, false)])).toBe(true);
  });
});

describe("countLabel", () => {
  test("counts approved rows, then pending ones", () => {
    expect(countLabel(1, 0)).toBe("1 feature");
    expect(countLabel(2, 0)).toBe("2 features");
    expect(countLabel(9, 2)).toBe("9 features · 2 proposed");
    expect(countLabel(0, 2)).toBe("2 proposed");
  });
});
