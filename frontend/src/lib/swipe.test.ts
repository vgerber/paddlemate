import { describe, expect, test } from "bun:test";
import {
  dragOffset,
  dragProgress,
  EDGE_RESISTANCE,
  inEdgeZone,
  lockDirection,
  releaseVelocity,
  resist,
  settleDuration,
  targetIndex,
} from "./swipe";
import { theme } from "./theme";

const { motion } = theme.tokens;

describe("lockDirection", () => {
  test("waits until the finger has moved about 8px", () => {
    expect(lockDirection(5, 3)).toBe("pending");
  });

  test("a mostly horizontal drag is a swipe", () => {
    expect(lockDirection(-20, 8)).toBe("horizontal");
  });

  test("steeper than 30 degrees scrolls instead", () => {
    expect(lockDirection(10, 12)).toBe("vertical");
    expect(lockDirection(20, 13)).toBe("vertical");
  });
});

describe("inEdgeZone", () => {
  test("the first 24px at either edge are left alone", () => {
    expect(inEdgeZone(10, 400)).toBe(true);
    expect(inEdgeZone(390, 400)).toBe(true);
    expect(inEdgeZone(24, 400)).toBe(false);
  });
});

describe("resist", () => {
  test("grows with the drag but stays under the limit", () => {
    expect(resist(10)).toBeGreaterThan(0);
    expect(resist(10)).toBeLessThan(resist(60));
    expect(resist(5000)).toBeLessThanOrEqual(EDGE_RESISTANCE);
  });
});

describe("dragOffset", () => {
  test("follows the finger where a neighbour exists", () => {
    expect(dragOffset(-120, true, true)).toBe(-120);
    expect(dragOffset(90, true, true)).toBe(90);
  });

  test("resists to the right on the first tab and left on the last", () => {
    expect(dragOffset(200, false, true)).toBeGreaterThan(0);
    expect(dragOffset(200, false, true)).toBeLessThanOrEqual(EDGE_RESISTANCE);
    expect(dragOffset(-200, true, false)).toBeLessThan(0);
    expect(dragOffset(-200, true, false)).toBeGreaterThanOrEqual(
      -EDGE_RESISTANCE,
    );
  });
});

describe("targetIndex", () => {
  test("commits past 40% of the width", () => {
    expect(targetIndex(0, 3, -170, 0, 400)).toBe(1);
    expect(targetIndex(1, 3, 170, 0, 400)).toBe(0);
  });

  test("springs back below 40%", () => {
    expect(targetIndex(0, 3, -150, 0, 400)).toBe(0);
  });

  test("a flick commits at any distance, in its own direction", () => {
    expect(targetIndex(0, 3, -40, -0.8, 400)).toBe(1);
    expect(targetIndex(1, 3, -40, 0.8, 400)).toBe(1);
  });

  test("never leaves the first or last tab", () => {
    expect(targetIndex(0, 3, 300, 0.9, 400)).toBe(0);
    expect(targetIndex(2, 3, -300, -0.9, 400)).toBe(2);
  });
});

describe("settleDuration", () => {
  test("runs from base for a hop to slow for a full width", () => {
    expect(settleDuration(0, 400)).toBe(motion.base);
    expect(settleDuration(400, 400)).toBe(motion.slow);
    expect(settleDuration(9999, 400)).toBe(motion.slow);
  });

  test("grows with the distance", () => {
    expect(settleDuration(300, 400)).toBeGreaterThan(settleDuration(100, 400));
  });
});

describe("dragProgress", () => {
  test("is positive toward the next tab and clamped", () => {
    expect(dragProgress(-200, 400)).toBe(0.5);
    expect(dragProgress(100, 400)).toBe(-0.25);
    expect(dragProgress(-900, 400)).toBe(1);
  });
});

describe("releaseVelocity", () => {
  test("uses only the last 100ms", () => {
    const v = releaseVelocity([
      { x: 0, t: 0 },
      { x: -100, t: 50 },
      { x: -200, t: 300 },
      { x: -260, t: 360 },
    ]);
    expect(v).toBeCloseTo(-1, 5);
  });

  test("a finger that rested before release has no speed", () => {
    expect(
      releaseVelocity([
        { x: 0, t: 0 },
        { x: -100, t: 50 },
        { x: -100, t: 400 },
      ]),
    ).toBe(0);
  });
});
