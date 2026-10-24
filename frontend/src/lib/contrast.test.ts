import { describe, expect, test } from "bun:test";
import { type Scheme, theme, tokensFor } from "./theme";

type Rgb = [number, number, number];

function parse(color: string): { rgb: Rgb; alpha: number } {
  if (color === "transparent") return { rgb: [0, 0, 0], alpha: 0 };
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], alpha: 1 };
  }
  const m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(color);
  if (!m) throw new Error(`unsupported colour ${color}`);
  return { rgb: [+m[1], +m[2], +m[3]], alpha: +m[4] };
}

/** The colour as seen over an opaque ground (a wash keeps its alpha). */
function over(color: string, ground: Rgb): Rgb {
  const { rgb, alpha } = parse(color);
  return rgb.map((v, i) => v * alpha + ground[i] * (1 - alpha)) as Rgb;
}

const rgbOf = (color: string): Rgb => parse(color).rgb;

/** WCAG 2.x relative luminance. */
function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(fg: Rgb, bg: Rgb): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = rgbOf("#ffffff");

describe("ratio", () => {
  test("black on white is 21:1", () => {
    expect(ratio([0, 0, 0], WHITE)).toBeCloseTo(21, 5);
  });
  test("a wash is composited over its ground", () => {
    expect(over("rgba(0,0,0,0.5)", WHITE)[0]).toBeCloseTo(127.5, 5);
  });
});

const schemes: Scheme[] = ["light", "dark"];

for (const scheme of schemes) {
  describe(`${scheme} scheme`, () => {
    const t = tokensFor(scheme);
    const grounds = {
      surface: rgbOf(t.surface),
      surfaceLow: rgbOf(t.surfaceLow),
      surfaceHigh: rgbOf(t.surfaceHigh),
      surfaceHighest: rgbOf(t.surfaceHighest),
    };
    type Ground = keyof typeof grounds;
    const threeGrounds: Ground[] = ["surface", "surfaceLow", "surfaceHigh"];

    describe("text pairs reach 4.5:1", () => {
      const pairs: [string, string, string][] = [
        ["onPrimary on primary", t.onPrimary, t.primary],
        ["onPrimary on primaryDark", t.onPrimary, t.primaryDark],
        ["primary on primaryContainer", t.primary, t.primaryContainer],
        [
          "onPrimaryContainer on primaryContainer",
          t.onPrimaryContainer,
          t.primaryContainer,
        ],
        [
          "onSuccessContainer on successContainer",
          t.onSuccessContainer,
          t.successContainer,
        ],
        ["success on successContainer", t.success, t.successContainer],
        ["onSurface on errorContainer", t.onSurface, t.errorContainer],
        ["error on errorContainer", t.error, t.errorContainer],
        ["onSuccess on success", t.onSuccess, t.success],
        ["onError on error", t.onError, t.error],
        ["high text on high bg", t.levels.high.text, t.levels.high.bg],
      ];
      for (const [name, fg, bg] of pairs) {
        test(name, () => {
          expect(ratio(rgbOf(fg), rgbOf(bg))).toBeGreaterThanOrEqual(4.5);
        });
      }

      for (const g of Object.keys(grounds) as Ground[]) {
        test(`onSurface and onSurfaceVariant on ${g}`, () => {
          expect(ratio(rgbOf(t.onSurface), grounds[g])).toBeGreaterThanOrEqual(
            4.5,
          );
          expect(
            ratio(rgbOf(t.onSurfaceVariant), grounds[g]),
          ).toBeGreaterThanOrEqual(4.5);
        });
      }

      for (const g of threeGrounds) {
        test(`primary, success and error text on ${g}`, () => {
          for (const c of [t.primary, t.success, t.error]) {
            expect(ratio(rgbOf(c), grounds[g])).toBeGreaterThanOrEqual(4.5);
          }
        });
      }

      for (const level of ["empty", "low", "medium"] as const) {
        const l = t.levels[level];
        for (const g of threeGrounds) {
          test(`level ${level} text on its wash over ${g}`, () => {
            const wash = over(l.bg, grounds[g]);
            expect(ratio(rgbOf(l.text), wash)).toBeGreaterThanOrEqual(4.5);
          });
        }
      }
    });

    // Geometry is read on the map: white under light, the dark map ground under dark.
    const mapGround = scheme === "light" ? "#ffffff" : t.mapGround;
    describe("marks, icons, focus and control edges reach 3:1", () => {
      const marks: [string, string][] = [
        ["level empty marker", t.levels.empty.marker],
        ["level low marker", t.levels.low.marker],
        ["level medium marker", t.levels.medium.marker],
        ["level high marker", t.levels.high.marker],
        ["putIn", t.putIn],
        ["takeOut", t.takeOut],
        ...Object.entries(t.featureColors).map(([k, v]): [string, string] => [
          `feature ${k}`,
          v,
        ]),
      ];
      for (const [name, color] of marks) {
        test(`${name} on the ${scheme} map ground`, () => {
          expect(ratio(rgbOf(color), rgbOf(mapGround))).toBeGreaterThanOrEqual(
            3,
          );
        });
      }

      for (const g of threeGrounds) {
        test(`focus ring (primary) and outline on ${g}`, () => {
          expect(ratio(rgbOf(t.primary), grounds[g])).toBeGreaterThanOrEqual(3);
          expect(ratio(rgbOf(t.outline), grounds[g])).toBeGreaterThanOrEqual(3);
        });
      }

      test.skipIf(scheme === "dark")(
        "the input edge at rest is outline, not the hairline",
        () => {
          const root = theme.components?.MuiFilledInput?.styleOverrides?.root;
          const shadow = (root as { boxShadow: string }).boxShadow;
          expect(shadow).toContain(t.outline);
          expect(
            ratio(rgbOf(t.outline), rgbOf(t.surface)),
          ).toBeGreaterThanOrEqual(3);
        },
      );
    });

    describe("level markers", () => {
      test("high is darker than low, and all four are distinct colours", () => {
        const m = t.levels;
        const lum = (c: string) => luminance(rgbOf(c));
        expect(lum(m.high.marker)).toBeLessThan(lum(m.low.marker));
        const all = [m.empty, m.low, m.medium, m.high].map((l) => l.marker);
        expect(new Set(all).size).toBe(4);
      });
    });
  });
}

describe("the dark palette table (doc/plans/dark-mode.md)", () => {
  const d = tokensFor("dark");
  const rows: [string, string, string, number][] = [
    ["onSurface on surface", d.onSurface, d.surface, 13.5],
    ["onSurface on ground", d.onSurface, d.background, 14.9],
    ["onSurfaceVariant on surface", d.onSurfaceVariant, d.surface, 6.5],
    ["onSurfaceVariant on surfaceHigh", d.onSurfaceVariant, d.surfaceHigh, 5.8],
    ["primary on surface", d.primary, d.surface, 8.1],
    ["primary on ground", d.primary, d.background, 9.0],
    ["onPrimary on primary", d.onPrimary, d.primary, 8.2],
    ["primaryDark on surface", d.primaryDark, d.surface, 6.6],
    [
      "onPrimaryContainer on container",
      d.onPrimaryContainer,
      d.primaryContainer,
      8.8,
    ],
    ["success on surface", d.success, d.surface, 8.9],
    [
      "onSuccessContainer on container",
      d.onSuccessContainer,
      d.successContainer,
      9.3,
    ],
    ["onSuccess on success", d.onSuccess, d.success, 9.7],
    ["error on surface", d.error, d.surface, 6.6],
    ["errorDark on surface", d.errorDark, d.surface, 8.0],
    ["error on errorContainer", d.error, d.errorContainer, 5.7],
    ["onError on error", d.onError, d.error, 6.6],
    ["outline on surface", d.outline, d.surface, 4.6],
    ["outline on surfaceHigh", d.outline, d.surfaceHigh, 4.2],
    ["empty text on surface", d.levels.empty.text, d.surface, 6.9],
    ["mapSectionLine on map ground", d.mapSectionLine, d.mapGround, 6.6],
    ["mapSelectedLine on map ground", d.mapSelectedLine, d.mapGround, 8.1],
    ["mapLabelText on ground", d.mapLabelText, d.mapGround, 10.4],
    ["mapCountryBorder on map ground", d.mapCountryBorder, d.mapGround, 7.6],
    ["gaugeTracked on map ground", d.gaugeTracked, d.mapGround, 6.4],
    ["gaugeUntracked on map ground", d.gaugeUntracked, d.mapGround, 3.5],
    ["chartSeries on surface", d.chartSeries, d.surface, 8.1],
    ["white ring on map ground", d.white, d.mapGround, 15.75],
  ];
  for (const [name, fg, bg, min] of rows) {
    test(`${name} >= ${min}`, () => {
      // The table is rounded to one decimal.
      expect(ratio(rgbOf(fg), rgbOf(bg))).toBeGreaterThanOrEqual(min - 0.1);
    });
  }

  test("a highlighted section differs from the ghost by lightness", () => {
    const g = ratio(rgbOf(d.mapSectionHighlight), rgbOf(d.mapSectionGhost));
    expect(g).toBeGreaterThanOrEqual(3);
  });
});
