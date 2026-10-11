import type { CardKind } from "@/lib/cardWidth";
import { theme } from "@/lib/theme";

const { canvas } = theme.tokens;

export type CardSide = "left" | "right";

export interface CardInput {
  id: string;
  side: CardSide;
  kind: CardKind;
  priority: number;
  /** Expanded width in px. */
  width: number;
}

export interface Placement extends CardInput {
  /** Left edge in px from the host's left edge. */
  x: number;
  collapsed: boolean;
}

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FreeArea {
  rect: Rect;
  padding: Padding;
  /** The free area was too small to frame anything, so the whole host is
   * used instead. */
  fallback: boolean;
}

export interface DockRect {
  left: number;
  width: number;
  height: number;
}

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(Math.max(n, lo), hi);

export const expandedLimit = (windowWidth: number) =>
  canvas.coverMax * windowWidth;

/** Ids to fold to their header so the expanded cards cover at most the
 * budget. Lowest priority folds first, a detail card after the others; the
 * pinned card (the one the user just opened) only after everything else. The
 * last expanded card never folds. */
export function collapsedIds(
  cards: CardInput[],
  windowWidth: number,
  pinnedId: string | null = null,
): Set<string> {
  const folded = new Set<string>();
  const limit = expandedLimit(windowWidth);
  const used = () =>
    cards.reduce((sum, c) => (folded.has(c.id) ? sum : sum + c.width), 0);
  const rank = (c: CardInput) => [
    c.id === pinnedId ? 1 : 0,
    c.kind === "detail" ? 1 : 0,
    c.priority,
    -cards.indexOf(c),
  ];
  const order = [...cards].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) {
      if (ra[i] !== rb[i]) return ra[i] - rb[i];
    }
    return 0;
  });
  for (const card of order) {
    if (used() <= limit) break;
    if (cards.length - folded.size <= 1) break;
    folded.add(card.id);
  }
  return folded;
}

/** Positions every card: expanded ones from their window edge inwards in
 * input order, folded ones after them. */
export function layoutCards(
  cards: CardInput[],
  windowWidth: number,
  pinnedId: string | null = null,
): Placement[] {
  const folded = collapsedIds(cards, windowWidth, pinnedId);
  const cursor: Record<CardSide, number> = {
    left: canvas.margin,
    right: canvas.margin,
  };
  const placed = new Map<string, Placement>();
  for (const isFolded of [false, true]) {
    for (const c of cards) {
      if (folded.has(c.id) !== isFolded) continue;
      const offset = cursor[c.side];
      cursor[c.side] += c.width + canvas.margin;
      const x = c.side === "left" ? offset : windowWidth - offset - c.width;
      placed.set(c.id, { ...c, x, collapsed: isFolded });
    }
  }
  return cards.map((c) => placed.get(c.id) as Placement);
}

/** The height the dock takes: a share of the window height, kept in range. */
export function dockHeight(windowHeight: number): number {
  return Math.round(
    clamp(windowHeight * canvas.dock.vh, canvas.dock.min, canvas.dock.max),
  );
}

export function dockMode(windowWidth: number): "dock" | "inline" {
  return windowWidth >= canvas.dock.from ? "dock" : "inline";
}

function edges(placements: Placement[], windowWidth: number) {
  let left = 0;
  let right = windowWidth;
  for (const p of placements) {
    if (p.collapsed) continue;
    if (p.side === "left") left = Math.max(left, p.x + p.width);
    else right = Math.min(right, p.x);
  }
  return { left, right };
}

/** Where the chart dock sits: from the rightmost left card plus a margin to
 * the leftmost right card minus a margin. */
export function dockRect(
  placements: Placement[],
  windowWidth: number,
  windowHeight: number,
): DockRect {
  const e = edges(placements, windowWidth);
  const m = canvas.margin;
  const left = e.left > 0 ? e.left + m : m;
  const right = e.right < windowWidth ? e.right - m : windowWidth - m;
  return {
    left,
    width: Math.max(0, right - left),
    height: dockHeight(windowHeight),
  };
}

/** The map area no card or dock covers, and the padding that keeps a fitted
 * subject inside it. `hostHeight` is the window less the app bar. */
export function freeArea(
  placements: Placement[],
  windowWidth: number,
  hostHeight: number,
  dock: number | null,
): FreeArea {
  const e = edges(placements, windowWidth);
  const cap = canvas.sideMaxFrac * windowWidth;
  const m = canvas.freeMargin;
  const padding: Padding = {
    top: m,
    left: Math.min(e.left + m, cap),
    right: Math.min(windowWidth - e.right + m, cap),
    bottom: dock == null ? m : canvas.margin + dock + m,
  };
  const rectOf = (p: Padding): Rect => ({
    x: p.left,
    y: p.top,
    w: windowWidth - p.left - p.right,
    h: hostHeight - p.top - p.bottom,
  });
  const rect = rectOf(padding);
  if (rect.w < canvas.freeMin.w || rect.h < canvas.freeMin.h) {
    const whole = { top: m, left: m, right: m, bottom: m };
    return { rect: rectOf(whole), padding: whole, fallback: true };
  }
  return { rect, padding, fallback: false };
}
