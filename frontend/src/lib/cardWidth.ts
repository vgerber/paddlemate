import { theme } from "@/lib/theme";

const { canvas } = theme.tokens;

export type CardKind = keyof typeof canvas.cards;

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(Math.max(n, lo), hi);

/** The range a card may be dragged within, or null for a fixed-width card. */
export function resizeBounds(
  kind: CardKind,
  windowWidth: number,
): { min: number; max: number } | null {
  const { resize } = canvas.cards[kind];
  if (!resize) return null;
  return {
    min: resize.min,
    max: Math.max(resize.min, resize.maxFrac * windowWidth),
  };
}

/** Width of a card in px: the remembered fraction when the card can be
 * resized and one was saved, else the kind's share of the window clamped to
 * its range. */
export function cardWidth(
  kind: CardKind,
  windowWidth: number,
  frac?: number | null,
): number {
  const spec = canvas.cards[kind];
  const bounds = resizeBounds(kind, windowWidth);
  if (bounds && frac != null && Number.isFinite(frac)) {
    return clamp(frac * windowWidth, bounds.min, bounds.max);
  }
  return clamp(spec.frac * windowWidth, spec.min, spec.max);
}

/** A dragged width held to the card's resize range (unchanged if fixed). */
export function clampCardWidth(
  kind: CardKind,
  width: number,
  windowWidth: number,
): number {
  const bounds = resizeBounds(kind, windowWidth);
  return bounds ? clamp(width, bounds.min, bounds.max) : width;
}

const storageKey = (screen: string, id: string) =>
  `paddlemate.cardFrac.${screen}.${id}`;

/** The remembered width fraction of a card, or null when none was saved or
 * storage is unavailable. Nonsense values are ignored. */
export function readCardFrac(screen: string, id: string): number | null {
  try {
    const raw = localStorage.getItem(storageKey(screen, id));
    if (raw == null) return null;
    const frac = Number(raw);
    return Number.isFinite(frac) && frac > 0 && frac < 1 ? frac : null;
  } catch {
    return null;
  }
}

/** Remembers a card's width as a fraction of the window. Never throws. */
export function writeCardFrac(screen: string, id: string, frac: number) {
  try {
    localStorage.setItem(storageKey(screen, id), String(frac));
  } catch {
    // Storage blocked or full: the width just is not remembered.
  }
}
