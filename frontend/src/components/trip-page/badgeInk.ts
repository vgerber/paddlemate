import { lightTokens } from "@/lib/theme";

const WHITE = lightTokens.white;

function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = Number.parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The number's colour on a base badge: white as in light, except in dark,
 * where the badge colour is whichever of white and `ink` reads better on it.
 * Light keeps white so its pixels stay as they were. */
export function badgeInk(fill: string, ink: string, dark: boolean): string {
  if (!dark) return WHITE;
  return ratio(ink, fill) > ratio(WHITE, fill) ? ink : WHITE;
}
