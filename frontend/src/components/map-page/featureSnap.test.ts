import { describe, expect, test } from "bun:test";
import {
  dragHeight,
  LIST_PULL,
  settleSheet,
  sheetPadding,
  stepOf,
} from "./featureSnap";

const heights = { peek: 120, half: 400 };

describe("dragHeight", () => {
  test("dragging up grows the sheet, down shrinks it", () => {
    expect(dragHeight(120, -100, heights)).toBe(220);
    expect(dragHeight(400, 100, heights)).toBe(300);
  });

  test("stops at zero and a little past half", () => {
    expect(dragHeight(120, 500, heights)).toBe(0);
    expect(dragHeight(400, -900, heights)).toBe(400 + 2 * LIST_PULL);
  });
});

describe("settleSheet", () => {
  test("a slow release goes to the nearer rest", () => {
    expect(settleSheet(200, 0, "peek", heights)).toBe("peek");
    expect(settleSheet(300, 0, "peek", heights)).toBe("half");
  });

  test("a low release closes, a high one pulls to the list", () => {
    expect(settleSheet(40, 0, "peek", heights)).toBe("close");
    expect(settleSheet(400 + LIST_PULL + 1, 0, "half", heights)).toBe("list");
  });

  test("a flick moves one step the way it points", () => {
    expect(settleSheet(130, -1, "peek", heights)).toBe("half");
    expect(settleSheet(390, -1, "half", heights)).toBe("list");
    expect(settleSheet(390, 1, "half", heights)).toBe("peek");
    expect(settleSheet(130, 1, "peek", heights)).toBe("close");
  });
});

describe("stepOf", () => {
  test("a drag to the left steps to the next feature", () => {
    expect(stepOf(-60, 0)).toBe(1);
    expect(stepOf(60, 0)).toBe(-1);
  });

  test("a short, slow drag steps nowhere", () => {
    expect(stepOf(-20, 0.1)).toBe(0);
  });

  test("a short flick steps", () => {
    expect(stepOf(-20, -0.8)).toBe(1);
  });
});

test("sheetPadding leaves the sheet and a margin at the bottom", () => {
  expect(sheetPadding(120).bottom).toBe(136);
});
