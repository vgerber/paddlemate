import { describe, expect, test } from "bun:test";
import {
  type CardInput,
  collapsedIds,
  controlInset,
  coverFrac,
  dockHeight,
  dockMode,
  dockRect,
  expandedLimit,
  fitsBeside,
  freeArea,
  layoutCards,
} from "./canvasLayout";

const detail = (width: number): CardInput => ({
  id: "detail",
  side: "left",
  kind: "detail",
  priority: 3,
  width,
});
const list = (width = 300): CardInput => ({
  id: "list",
  side: "left",
  kind: "list",
  priority: 1,
  width,
});
const side = (width = 400): CardInput => ({
  id: "side",
  side: "right",
  kind: "side",
  priority: 2,
  width,
});

describe("cover budget", () => {
  test("one detail card may cover 55%, a list screen 70%", () => {
    expect(coverFrac([detail(486)])).toBe(0.55);
    expect(coverFrac([list(), side()])).toBe(0.7);
    expect(expandedLimit(1000, [detail(400)])).toBe(550);
    expect(expandedLimit(1000, [list(), side()])).toBe(700);
  });

  test("list and side fit at 1280 without folding", () => {
    expect(collapsedIds([list(), side()], 1280).size).toBe(0);
  });

  test("list, trip and members fit at exactly 1600", () => {
    const members = { ...side(), id: "members", priority: 0 };
    const trip = { ...side(400), id: "trip", side: "left" as const };
    expect(collapsedIds([list(320), trip, members], 1600).size).toBe(0);
  });

  test("the map page's detail card plus a side card still folds at 55%", () => {
    expect([...collapsedIds([detail(486), side()], 1280)]).toEqual(["side"]);
  });
});

describe("room for the map", () => {
  test("list and side at 1024 fold the list: 228px would be left", () => {
    expect([...collapsedIds([list(), side()], 1024)]).toEqual(["list"]);
  });

  test("list and side at 1100 leave room and stay open", () => {
    expect(collapsedIds([list(), side()], 1100).size).toBe(0);
  });

  test("the last card never folds for room", () => {
    expect(collapsedIds([side(400)], 600).size).toBe(0);
  });
});

describe("collapsedIds", () => {
  test("keeps everything while the cards cover at most 55%", () => {
    expect(collapsedIds([detail(486)], 1280).size).toBe(0);
    expect(collapsedIds([list(300), detail(420)], 1440).size).toBe(0);
  });

  test("folds the lowest priority card first", () => {
    expect([...collapsedIds([list(), detail(420)], 1024)]).toEqual(["list"]);
    expect([...collapsedIds([detail(486), side(400)], 1100)]).toEqual(["side"]);
  });

  test("a pinned card stays open and the detail card folds instead", () => {
    expect([...collapsedIds([list(), detail(420)], 1024, "list")]).toEqual([
      "detail",
    ]);
  });

  test("never folds the last card", () => {
    expect(collapsedIds([detail(700)], 800).size).toBe(0);
  });
});

describe("layoutCards", () => {
  test("left cards stack from the margin, right cards from the edge", () => {
    const [a, b, c] = layoutCards([list(), detail(486), side()], 2400);
    expect(a.x).toBe(16);
    expect(b.x).toBe(16 + 300 + 16);
    expect(c.x).toBe(2400 - 16 - 400);
  });

  test("a folded card goes after the open ones", () => {
    const placed = layoutCards([list(), detail(420)], 1024);
    expect(placed[1].x).toBe(16);
    expect(placed[0].collapsed).toBe(true);
    expect(placed[0].x).toBe(16 + 420 + 16);
  });
});

describe("freeArea", () => {
  test("padding is the card edge plus 32", () => {
    const placed = layoutCards([detail(486)], 1280);
    const free = freeArea(placed, 1280, 744, null);
    expect(free.padding).toEqual({
      top: 32,
      left: 502 + 32,
      right: 32,
      bottom: 32,
    });
    expect(free.rect).toEqual({ x: 534, y: 32, w: 1280 - 534 - 32, h: 680 });
  });

  test("a dock lifts the bottom padding by its height and margin", () => {
    const placed = layoutCards([detail(486)], 1280);
    expect(freeArea(placed, 1280, 744, 180).padding.bottom).toBe(16 + 180 + 32);
  });

  test("a folded card does not cover the free area (left capped at 45%)", () => {
    const placed = layoutCards([list(), detail(420)], 1024);
    expect(freeArea(placed, 1024, 700, null).padding.left).toBe(1024 * 0.45);
  });

  test("each side is clamped to 45% of the window", () => {
    const placed = layoutCards([detail(700)], 1000);
    expect(freeArea(placed, 1000, 700, null).padding.left).toBe(450);
  });

  test("clear is the card edge plus the margin, uncapped", () => {
    const placed = layoutCards([side(400)], 768);
    const free = freeArea(placed, 768, 700, null);
    expect(free.padding.right).toBe(768 * 0.45);
    expect(free.clear.right).toBe(16 + 400 + 32);
  });

  test("falls back to the whole host when the free area is tiny", () => {
    const placed = [
      { ...detail(450), x: 16, collapsed: false },
      { ...side(400), x: 564, collapsed: false },
    ];
    const free = freeArea(placed, 1000, 700, null);
    expect(free.fallback).toBe(true);
    expect(free.padding).toEqual({ top: 32, left: 32, right: 32, bottom: 32 });
    expect(free.clear.left).toBe(16 + 450 + 32);
  });
});

describe("rail", () => {
  test("height is 22% of the window within 184 to 248", () => {
    expect(dockHeight(720)).toBe(184);
    expect(dockHeight(900)).toBe(198);
    expect(dockHeight(1080)).toBe(238);
    expect(dockHeight(1440)).toBe(248);
  });

  test("shows from 1280 wide and 600 tall, else the chart leads the card", () => {
    expect(dockMode(1280, 720)).toBe("dock");
    expect(dockMode(1279, 720)).toBe("inline");
    expect(dockMode(1920, 599)).toBe("inline");
    expect(dockMode(1920, 600)).toBe("dock");
  });

  test("starts a gutter from the card and ends 16px short of the window", () => {
    const placed = layoutCards([detail(486)], 1280);
    expect(dockRect(placed, 1280, 800)).toEqual({
      left: 510,
      width: 1280 - 510 - 16,
      height: 184,
    });
  });

  test("stops at a right card", () => {
    const placed = layoutCards([detail(486), side()], 1920);
    const dock = dockRect(placed, 1920, 1080);
    expect(dock.left + dock.width).toBe(1920 - 16 - 400 - 16);
  });
});

describe("controlInset", () => {
  test("sits 16px inside a card, 8px above the rail, 24px above the foot", () => {
    const placed = layoutCards([detail(486)], 1280);
    const free = freeArea(placed, 1280, 744, 184);
    expect(controlInset(free.padding, 184)).toEqual({
      top: 16,
      left: 502 + 16,
      right: 16,
      bottom: 16 + 184 + 8,
    });
  });

  test("without a rail the foot is 24px", () => {
    const placed = layoutCards([detail(486)], 1280);
    const free = freeArea(placed, 1280, 744, null);
    expect(controlInset(free.padding, null).bottom).toBe(24);
  });
});

describe("fitsBeside", () => {
  test("a list and a side card fold one of them at 1000, not at 1600", () => {
    expect(fitsBeside(["list", "side"], 1000)).toBe(false);
    expect(fitsBeside(["list", "side"], 1600)).toBe(true);
  });
  test("one card always fits", () => {
    expect(fitsBeside(["side"], 800)).toBe(true);
  });
});

describe("card order", () => {
  test("a list card sits nearest its edge even when it registered last", () => {
    const [side, list] = layoutCards(
      [
        { id: "log", side: "left", kind: "side", priority: 1, width: 400 },
        { id: "list", side: "left", kind: "list", priority: 2, width: 300 },
      ],
      1600,
    );
    expect(list.x).toBeLessThan(side.x);
    expect(side.x).toBe(list.x + list.width + 16);
  });
});
