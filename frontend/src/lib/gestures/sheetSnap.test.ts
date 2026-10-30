import { describe, expect, test } from "bun:test";
import { dragHeight, offsetFor, settleState, snapHeights } from "./sheetSnap";

const snaps = snapHeights(800, 120);

describe("snapHeights", () => {
  test("open is a share of the viewport", () => {
    expect(snaps).toEqual({ peek: 120, open: 680 });
  });

  test("open never drops below the peek", () => {
    expect(snapHeights(100, 120).open).toBe(120);
  });
});

describe("dragHeight", () => {
  test("dragging up grows the sheet", () => {
    expect(dragHeight(120, -200, snaps)).toBe(320);
  });

  test("it stops at the peek and at the open height", () => {
    expect(dragHeight(120, 300, snaps)).toBe(120);
    expect(dragHeight(600, -500, snaps)).toBe(680);
  });
});

describe("settleState", () => {
  test("goes to the nearer snap when released slowly", () => {
    expect(settleState(300, 0, snaps)).toBe("peek");
    expect(settleState(500, 0, snaps)).toBe("open");
  });

  test("a flick goes the way it points", () => {
    expect(settleState(150, -1, snaps)).toBe("open");
    expect(settleState(650, 1, snaps)).toBe("peek");
  });

  test("a slow drag is not a flick", () => {
    expect(settleState(150, -0.2, snaps)).toBe("peek");
  });
});

describe("offsetFor", () => {
  test("is zero at open and the gap at peek", () => {
    expect(offsetFor(680, snaps)).toBe(0);
    expect(offsetFor(120, snaps)).toBe(560);
  });
});
