/** The only alpha steps a colour is given: tint for row washes, wash for
 * selected grounds, hover on top of them, strong for an avatar tile, hairline
 * for rules, border for control outlines, scrim over imagery. Values are the
 * old hex-suffix bytes; `withAlpha` turns them into percentages. */
export const alphas = {
  tint: "0d",
  wash: "14",
  hover: "1f",
  strong: "2e",
  hairline: "55",
  border: "99",
  scrim: "cc",
} as const;

export type AlphaStep = keyof typeof alphas;

function percent(amount: AlphaStep | number): number {
  if (typeof amount === "number") return amount;
  return (Number.parseInt(alphas[amount], 16) / 255) * 100;
}

/** `color` at a step (or a percentage 0-100) of opacity, as CSS. Works on a
 * hex, an `rgb()` and a `var(--pm-x)`. Only for CSS contexts (`sx`, `style`,
 * `boxShadow`): MapLibre paint and SVG attributes set an opacity instead. */
export function withAlpha(color: string, amount: AlphaStep | number): string {
  const p = Math.round(percent(amount) * 100) / 100;
  return `color-mix(in srgb, ${color} ${p}%, transparent)`;
}
