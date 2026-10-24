import { describe, expect, test } from "bun:test";
import { darkTokens, lightTokens, tokenCss, tokensFor, toVars } from "./theme";

function leaves(node: unknown, path: string[] = []): [string, unknown][] {
  if (typeof node !== "object" || node === null)
    return [[path.join("."), node]];
  return Object.entries(node).flatMap(([k, v]) => leaves(v, [...path, k]));
}

describe("tokens", () => {
  test("light and dark have the same keys", () => {
    expect(leaves(darkTokens).map(([k]) => k)).toEqual(
      leaves(lightTokens).map(([k]) => k),
    );
  });

  test("tokensFor returns the palette of the scheme", () => {
    expect(tokensFor("light")).toBe(lightTokens);
    expect(tokensFor("dark")).toBe(darkTokens);
  });

  test("the non-colour groups are shared", () => {
    for (const g of [
      "touch",
      "radii",
      "motion",
      "phone",
      "canvas",
      "chrome",
    ] as const) {
      expect(darkTokens[g]).toBe(lightTokens[g]);
    }
  });
});

describe("toVars", () => {
  const v = toVars(lightTokens);

  test("names are kebab-joined paths", () => {
    expect(v.surface).toBe("var(--pm-surface)");
    expect(v.onSurfaceVariant).toBe("var(--pm-on-surface-variant)");
    expect(v.levels.low.text).toBe("var(--pm-level-low-text)");
    expect(v.mapRegionPalette[2]).toBe("var(--pm-map-region-3)");
    expect(v.featureColors.put_in).toBe("var(--pm-feature-put-in)");
    expect(v.elevation.e2).toBe("var(--pm-e2)");
    expect(v.elevation.markerRaised).toBe("var(--pm-marker-raised)");
  });

  test("non-colour values pass through", () => {
    expect(v.touch).toBe(lightTokens.touch);
    expect(v.radii).toBe(lightTokens.radii);
    expect(v.levels.low.label).toBe("L");
  });

  test("every colour leaf is a distinct variable", () => {
    const vars = leaves(v)
      .map(([, x]) => x)
      .filter(
        (x): x is string => typeof x === "string" && x.startsWith("var("),
      );
    expect(new Set(vars).size).toBe(vars.length);
  });
});

describe("tokenCss", () => {
  test("declares every variable in both schemes", () => {
    const names = new Set(
      leaves(toVars(lightTokens)).flatMap(([, x]) => {
        const m =
          typeof x === "string" ? /^var\((--pm-[^)]+)\)$/.exec(x) : null;
        return m ? [m[1]] : [];
      }),
    );
    const [light, dark] = [
      tokenCss.split(':root[data-theme="dark"]{')[0],
      tokenCss,
    ];
    for (const n of names) {
      expect(light).toContain(`${n}:`);
      expect(dark).toContain(`${n}:`);
    }
  });

  test("dark values reach the dark block", () => {
    expect(tokenCss).toContain(
      `:root[data-theme="dark"]{--pm-surface-lowest:#1b2429;`,
    );
    expect(tokenCss).toContain("--pm-primary:#67c7e0;");
  });

  test("print puts the light palette back", () => {
    const print = tokenCss.slice(tokenCss.indexOf("@media print"));
    expect(print).toContain("color-scheme:light");
    expect(print).toContain(`--pm-background:${lightTokens.background};`);
    expect(print).toContain(
      `--mui-palette-text-primary:${lightTokens.onSurface};`,
    );
  });
});
