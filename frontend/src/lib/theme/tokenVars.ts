import { darkTokens } from "./darkTokens";
import { lightTokens, type Scheme, type Tokens } from "./tokens";

const PLAIN_GROUPS = new Set([
  "touch",
  "radii",
  "motion",
  "phone",
  "canvas",
  "chrome",
]);

const kebab = (name: string) =>
  name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replaceAll("_", "-");

function mapEntries<V, R>(
  group: Readonly<Record<string, V>>,
  fn: (key: string, value: V) => R,
): Record<string, R> {
  return Object.fromEntries(
    Object.entries(group).map(([k, v]) => [k, fn(k, v)]),
  );
}

/** Rebuilds `t` with every colour leaf passed through `fn(name, value)`, where
 * `name` is the kebab-joined path: `levels.low.text` is `level-low-text`,
 * `mapRegionPalette[2]` is `map-region-3`, `featureColors.put_in` is
 * `feature-put-in`, `elevation.e2` is `e2`. */
function mapColours(
  t: Tokens,
  fn: (name: string, value: string) => string,
): Tokens {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(t)) {
    if (PLAIN_GROUPS.has(key)) out[key] = value;
    else if (typeof value === "string") out[key] = fn(kebab(key), value);
    else if (key === "mapRegionPalette")
      out[key] = t.mapRegionPalette.map((c, i) => fn(`map-region-${i + 1}`, c));
    else if (key === "levels")
      out[key] = mapEntries(t.levels, (level, group) =>
        mapEntries(group, (field, c) =>
          field === "label" ? c : fn(`level-${level}-${field}`, c),
        ),
      );
    else if (key === "featureColors")
      out[key] = mapEntries(t.featureColors, (name, c) =>
        fn(`feature-${kebab(name)}`, c),
      );
    else if (key === "elevation")
      out[key] = mapEntries(t.elevation, (name, c) => fn(kebab(name), c));
  }
  return out as Tokens;
}

/** Tokens whose colour leaves are `var(--pm-*)` strings: usable wherever the
 * browser parses CSS, nowhere else (MapLibre, canvas, colour maths). */
export function toVars(t: Tokens): Tokens {
  return mapColours(t, (name) => `var(--pm-${name})`);
}

/** The `--pm-*` declarations of one palette. */
export function declarations(t: Tokens): string {
  const out: string[] = [];
  mapColours(t, (name, value) => {
    out.push(`--pm-${name}:${value};`);
    return value;
  });
  return out.join("");
}

/** Resolved tokens for a scheme (hex), for non-CSS contexts. */
export function tokensFor(scheme: Scheme): Tokens {
  return scheme === "dark" ? darkTokens : lightTokens;
}

/** The tokens every consumer imports: colours are `var(--pm-*)`, so one value
 * serves both schemes in CSS. Code that needs a real colour uses `useTokens()`. */
export const tokens = toVars(lightTokens);
