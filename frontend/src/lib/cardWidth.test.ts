import { afterEach, describe, expect, test } from "bun:test";
import {
  cardWidth,
  clampCardWidth,
  readCardFrac,
  resizeBounds,
  writeCardFrac,
} from "./cardWidth";

describe("cardWidth", () => {
  test("detail is 38% of the window within 420 to 720", () => {
    expect(Math.round(cardWidth("detail", 1280))).toBe(486);
    expect(Math.round(cardWidth("detail", 1440))).toBe(547);
    expect(cardWidth("detail", 1920)).toBe(720);
    expect(cardWidth("detail", 900)).toBe(420);
  });

  test("list is 20% within 300 to 380, side 25% within 400 to 600", () => {
    expect(cardWidth("list", 1000)).toBe(300);
    expect(cardWidth("list", 1920)).toBe(380);
    expect(cardWidth("side", 1280)).toBe(400);
    expect(cardWidth("side", 1920)).toBe(480);
    expect(cardWidth("side", 2400)).toBe(600);
  });

  test("a remembered fraction applies to the detail card only", () => {
    expect(cardWidth("detail", 1280, 0.3)).toBe(384);
    expect(cardWidth("list", 1280, 0.4)).toBe(300);
  });

  test("a remembered fraction is held to the resize range", () => {
    expect(cardWidth("detail", 1280, 0.1)).toBe(360);
    expect(cardWidth("detail", 1280, 0.9)).toBe(576);
    expect(cardWidth("detail", 1920, 0.5)).toBe(864);
  });

  test("resizeBounds is 360 to 45% for detail and null for fixed cards", () => {
    expect(resizeBounds("detail", 1000)).toEqual({ min: 360, max: 450 });
    expect(resizeBounds("list", 1000)).toBeNull();
  });

  test("clampCardWidth holds a drag in range and leaves fixed cards alone", () => {
    expect(clampCardWidth("detail", 100, 1280)).toBe(360);
    expect(clampCardWidth("detail", 2000, 1280)).toBe(576);
    expect(clampCardWidth("detail", 500, 1280)).toBe(500);
    expect(clampCardWidth("side", 5, 1280)).toBe(5);
  });
});

function stubStorage(store: Record<string, string> | "throws") {
  const blocked = () => {
    throw new Error("blocked");
  };
  const storage =
    store === "throws"
      ? { getItem: blocked, setItem: blocked }
      : {
          getItem: (k: string) => store[k] ?? null,
          setItem: (k: string, v: string) => {
            store[k] = v;
          },
        };
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  });
}

describe("card fraction storage", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "localStorage");
  });

  test("round-trips a fraction per screen and card", () => {
    stubStorage({});
    writeCardFrac("demo", "detail", 0.4);
    expect(readCardFrac("demo", "detail")).toBe(0.4);
    expect(readCardFrac("other", "detail")).toBeNull();
  });

  test("ignores values that are not a fraction", () => {
    stubStorage({
      "paddlemate.cardFrac.s.a": "abc",
      "paddlemate.cardFrac.s.b": "7",
      "paddlemate.cardFrac.s.c": "0",
    });
    expect(readCardFrac("s", "a")).toBeNull();
    expect(readCardFrac("s", "b")).toBeNull();
    expect(readCardFrac("s", "c")).toBeNull();
  });

  test("never throws when storage is blocked", () => {
    stubStorage("throws");
    expect(readCardFrac("s", "a")).toBeNull();
    expect(() => writeCardFrac("s", "a", 0.4)).not.toThrow();
  });
});
