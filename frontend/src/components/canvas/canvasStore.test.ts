import { afterEach, describe, expect, test } from "bun:test";
import { layout, scenes } from "./canvasStore";
import type { MapScene } from "./scene";

const scene = (key: string): MapScene => ({
  subject: {
    key,
    bounds: [
      [0, 0],
      [1, 1],
    ],
  },
});

describe("scenes", () => {
  afterEach(() => {
    const owner = Symbol("reset");
    scenes.set(owner, scene("x"));
    scenes.clear(owner);
  });

  test("the owner replaces and clears its scene", () => {
    const a = Symbol("a");
    scenes.set(a, scene("one"));
    expect(scenes.current()?.subject?.key).toBe("one");
    scenes.set(a, scene("two"));
    expect(scenes.current()?.subject?.key).toBe("two");
    scenes.clear(a);
    expect(scenes.current()).toBeNull();
  });

  test("a higher rank stays on top whatever the mount order", () => {
    const route = Symbol("route");
    const form = Symbol("form");
    // Child effects run first: the form sets its scene before the route.
    scenes.set(form, scene("form"), 1);
    scenes.set(route, scene("route"));
    expect(scenes.current()?.subject?.key).toBe("form");
    scenes.set(route, scene("route2"));
    expect(scenes.current()?.subject?.key).toBe("form");
    scenes.clear(form);
    expect(scenes.current()?.subject?.key).toBe("route2");
    scenes.clear(route);
  });

  test("a screen inside a route stacks over its scene and uncovers it", () => {
    const route = Symbol("route");
    const form = Symbol("form");
    scenes.set(route, scene("route"));
    scenes.set(form, scene("form"));
    scenes.set(route, scene("route2"));
    expect(scenes.current()?.subject?.key).toBe("form");
    scenes.clear(form);
    expect(scenes.current()?.subject?.key).toBe("route2");
    scenes.clear(route);
    expect(scenes.current()).toBeNull();
  });

  test("an old owner's cleanup never clears a newer scene", () => {
    const old = Symbol("old");
    const next = Symbol("next");
    scenes.set(old, scene("old"));
    scenes.set(next, scene("next"));
    scenes.clear(old);
    expect(scenes.current()?.subject?.key).toBe("next");
  });
});

describe("layout", () => {
  afterEach(() => {
    layout.unregister("a");
    layout.unregister("b");
    layout.setViewport({ w: 1280, h: 800 });
  });

  test("cards register, fold under the budget and unregister", () => {
    layout.setViewport({ w: 800, h: 800 });
    layout.register({
      id: "a",
      side: "left",
      kind: "detail",
      priority: 3,
      frac: null,
    });
    layout.register({
      id: "b",
      side: "left",
      kind: "list",
      priority: 1,
      frac: null,
    });
    const placed = layout.get().placements;
    expect(placed.get("a")?.collapsed).toBe(false);
    expect(placed.get("b")?.collapsed).toBe(true);
    layout.unregister("a");
    expect(layout.get().placements.get("b")?.collapsed).toBe(false);
  });

  test("a dragged width is held to the resize range", () => {
    layout.setViewport({ w: 1280, h: 800 });
    layout.register({
      id: "a",
      side: "left",
      kind: "detail",
      priority: 3,
      frac: null,
    });
    layout.setLive({ id: "a", width: 5000 });
    expect(layout.get().placements.get("a")?.width).toBe(560);
    layout.setLive(null);
    expect(Math.round(layout.get().placements.get("a")?.width ?? 0)).toBe(340);
  });
});
