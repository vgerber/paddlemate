import { describe, expect, test } from "bun:test";
import { type ResolvedTokens, type Scheme, tokensFor } from "@/lib/useTokens";
import {
  currentLevel,
  freshRanges,
  isCalibrated,
  LEVEL_MARKER_MATCH,
  LEVEL_ORDER,
  levelConfig,
  levelConfigFor,
  levelInk,
  levelMarkerColor,
  levelMarkerMatch,
  levelWord,
  maxLevel,
} from "./waterLevel";

type Range = Parameters<typeof isCalibrated>[0];

describe("maxLevel", () => {
  test("returns the most severe level", () => {
    expect(maxLevel(["low", "high", "medium"])).toBe("high");
    expect(maxLevel(["empty", "low"])).toBe("low");
  });

  test("empty input is empty", () => {
    expect(maxLevel([])).toBe("empty");
  });
});

describe("levelConfig", () => {
  test("covers every level in order", () => {
    for (const level of LEVEL_ORDER) {
      expect(levelConfig[level].label).toBeTruthy();
      expect(levelConfig[level].color).toBeTruthy();
    }
  });
});

describe("isCalibrated", () => {
  const range = (overrides: Partial<Range>): Range =>
    ({
      range_low: null,
      range_medium: null,
      range_high: null,
      ...overrides,
    }) as Range;

  test("true with any threshold set", () => {
    expect(isCalibrated(range({ range_low: 10 }))).toBe(true);
    expect(isCalibrated(range({ range_medium: 20 }))).toBe(true);
    expect(isCalibrated(range({ range_high: 30 }))).toBe(true);
  });

  test("false with no thresholds", () => {
    expect(isCalibrated(range({}))).toBe(false);
  });
});

describe("levelInk", () => {
  test("uses the pill colour for high, whose text is white", () => {
    expect(levelInk("high")).toBe(tokensFor("light").levels.high.ink);
    expect(levelInk("high")).not.toBe("#ffffff");
  });
  test("uses the text colour for low and medium", () => {
    expect(levelInk("low")).toBe(tokensFor("light").levels.low.text);
    expect(levelInk("medium")).toBe(tokensFor("light").levels.medium.text);
  });
});

describe("currentLevel", () => {
  const now = Date.parse("2026-10-14T12:00:00Z");
  const range = (ago: number, level: string, interval = 900) =>
    ({
      level,
      range_low: 50,
      gauge: { fetch_interval_secs: interval },
      latest_reading: {
        measured_at: new Date(now - ago * 3600_000).toISOString(),
      },
    }) as unknown as Range;

  test("fresh calibrated readings give the worst level", () => {
    expect(currentLevel([range(1, "low"), range(2, "high")], now)).toBe("high");
  });

  test("a stale range is ignored, a fresh one still counts", () => {
    expect(currentLevel([range(5, "high"), range(1, "low")], now)).toBe("low");
  });

  test("stale or uncalibrated readings give none", () => {
    expect(currentLevel([range(5, "high")], now)).toBeNull();
    expect(currentLevel([range(5, "high", 7200)], now)).toBe("high");
    const bare = { ...range(1, "high"), range_low: null } as Range;
    expect(currentLevel([bare], now)).toBeNull();
    expect(currentLevel([], now)).toBeNull();
  });

  test("freshRanges keeps only the ranges that count", () => {
    expect(freshRanges([range(5, "high"), range(1, "low")], now)).toHaveLength(
      1,
    );
  });
});

describe("levelMarkerColor", () => {
  test("is the theme marker hue of each level", () => {
    for (const level of LEVEL_ORDER) {
      expect(levelMarkerColor(level)).toBe(
        tokensFor("light").levels[level].marker,
      );
    }
  });

  test("the map expression falls back to the empty hue", () => {
    expect(LEVEL_MARKER_MATCH.at(-1)).toBe(levelMarkerColor("empty"));
    expect(LEVEL_MARKER_MATCH).toContain(levelMarkerColor("high"));
  });
});

describe("levelWord", () => {
  test("is the capitalised level", () => {
    expect(levelWord("low")).toBe("Low");
    expect(levelWord("medium")).toBe("Medium");
    expect(levelWord("high")).toBe("High");
  });
});

const SCHEMES: Scheme[] = ["light", "dark"];

describe.each(SCHEMES)("level colours in the %s scheme", (scheme) => {
  const t = tokensFor(scheme);

  test("levelInk reads the scheme's tokens", () => {
    expect(levelInk("low", scheme)).toBe(t.levels.low.text);
    expect(levelInk("medium", scheme)).toBe(t.levels.medium.text);
    expect(levelInk("high", scheme)).toBe(t.levels.high.ink);
    expect(levelInk("low", t)).toBe(levelInk("low", scheme));
  });

  test("levelMarkerColor reads the scheme's tokens", () => {
    for (const level of LEVEL_ORDER) {
      expect(levelMarkerColor(level, scheme)).toBe(t.levels[level].marker);
      expect(levelMarkerColor(level, t)).toBe(t.levels[level].marker);
    }
  });

  test("levelConfigFor reads the scheme's chip pair", () => {
    for (const level of LEVEL_ORDER) {
      expect(levelConfigFor(scheme)[level].color).toBe(t.levels[level].text);
      expect(levelConfigFor(scheme)[level].bgcolor).toBe(t.levels[level].bg);
    }
  });

  test("levelMarkerMatch uses the scheme's markers", () => {
    const match = levelMarkerMatch(scheme);
    expect(match).toContain(t.levels.high.marker);
    expect(match.at(-1)).toBe(t.levels.empty.marker);
  });
});

describe("scheme plumbing", () => {
  const probe = (c: string) => ({
    text: c,
    bg: c,
    marker: c,
    label: c,
    border: c,
  });
  // Literal-typed tokens: the probe values are not the light literals.
  const fake = {
    ...tokensFor("light"),
    levels: {
      empty: probe("#000001"),
      low: probe("#000002"),
      medium: probe("#000003"),
      high: probe("#000004"),
    },
  } as unknown as ResolvedTokens;

  test("given tokens reach every colour function", () => {
    expect(levelInk("low", fake)).toBe("#000002");
    expect(levelMarkerColor("high", fake)).toBe("#000004");
    expect(levelConfigFor(fake).medium.color).toBe("#000003");
    expect(levelMarkerMatch(fake).at(-1)).toBe("#000001");
  });

  test("the light defaults match the light scheme", () => {
    expect(levelConfig).toEqual(levelConfigFor("light"));
    expect(LEVEL_MARKER_MATCH).toEqual(levelMarkerMatch("light"));
  });
});
