import { type CardKind, cardWidth } from "@/lib/cardWidth";
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
  /** How far the cards reach in from each window edge plus the margin, with
   * no cap and no fallback: where map controls sit, so they are never under
   * a card even when the fit padding is held back. */
  clear: Padding;
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

/** Share of the window the open cards may cover: more when a list card sits
 * beside the open item, since both are needed to read the screen. */
export const coverFrac = (cards: { kind: CardKind }[]) =>
  cards.some((c) => c.kind === "list") ? canvas.coverMaxList : canvas.coverMax;

export const expandedLimit = (
  windowWidth: number,
  cards: { kind: CardKind }[] = [],
) => coverFrac(cards) * windowWidth;

/** Ids to fold to their header so the expanded cards cover at most the
 * budget and leave the map `freeMin.w` to frame in. Lowest priority folds first, a detail card after the others; the
 * pinned card (the one the user just opened) only after everything else. The
 * last expanded card never folds. */
export function collapsedIds(
  cards: CardInput[],
  windowWidth: number,
  pinnedId: string | null = null,
): Set<string> {
  const folded = new Set<string>();
  const limit = expandedLimit(windowWidth, cards);
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
  // Width left between the cards: each card has a margin, the free area two
  // margins of its own.
  const room = () =>
    windowWidth -
    used() -
    canvas.margin * (cards.length - folded.size) -
    2 * canvas.freeMargin;
  for (const card of order) {
    // Half a pixel of slack: 70% of 1600 must not fail on rounding.
    if (used() <= limit + 0.5 && room() >= canvas.freeMin.w) break;
    if (cards.length - folded.size <= 1) break;
    folded.add(card.id);
  }
  return folded;
}

/** Whether cards of these kinds, at their default widths, all stay expanded
 * side by side in a window this wide. A screen that would fold one shows a
 * single card instead. */
export function fitsBeside(kinds: CardKind[], windowWidth: number): boolean {
  const cards = kinds.map((kind, i) => ({
    id: String(i),
    side: "left" as const,
    kind,
    priority: canvas.cards[kind].priority,
    width: cardWidth(kind, windowWidth),
  }));
  return collapsedIds(cards, windowWidth).size === 0;
}

/** Positions every card: expanded ones from their window edge inwards in
 * input order (a list card first: it sits nearest its edge, whatever mounted
 * first), folded ones after them. */
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
  const ordered = [
    ...cards.filter((c) => c.kind === "list"),
    ...cards.filter((c) => c.kind !== "list"),
  ];
  for (const isFolded of [false, true]) {
    for (const c of ordered) {
      if (folded.has(c.id) !== isFolded) continue;
      const offset = cursor[c.side];
      cursor[c.side] += c.width + canvas.margin;
      const x = c.side === "left" ? offset : windowWidth - offset - c.width;
      placed.set(c.id, { ...c, x, collapsed: isFolded });
    }
  }
  return cards.map((c) => placed.get(c.id) as Placement);
}

/** The height of the rail and of the card's reading block: a share of the window height, kept in range. */
export function dockHeight(windowHeight: number): number {
  return Math.round(
    clamp(windowHeight * canvas.dock.vh, canvas.dock.min, canvas.dock.max),
  );
}

/** The rail needs a wide and tall enough window; otherwise the chart is the
 * detail card's first block. */
export function dockMode(
  windowWidth: number,
  windowHeight: number,
): "dock" | "inline" {
  return windowWidth >= canvas.dock.from &&
    windowHeight >= canvas.dock.minWindowHeight
    ? "dock"
    : "inline";
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

/** Where the rail sits: beside the left card's foot, one panel gutter from
 * its edge, and running to the leftmost right card minus a margin. */
export function dockRect(
  placements: Placement[],
  windowWidth: number,
  windowHeight: number,
): DockRect {
  const e = edges(placements, windowWidth);
  const m = canvas.margin;
  const left = e.left > 0 ? e.left + canvas.panel.gutter : m;
  const right = e.right < windowWidth ? e.right - m : windowWidth - m;
  return {
    left,
    width: Math.max(0, right - left),
    height: dockHeight(windowHeight),
  };
}

/** Where map controls sit, as edge insets: 16px inside the free area at the
 * top, right and left, and at the foot 24px above the window or 8px above the
 * rail (`rail` is its height), so a control is never under a card. */
export function controlInset(padding: Padding, rail: number | null): Padding {
  const trim = canvas.freeMargin - canvas.margin;
  return {
    top: Math.max(0, padding.top - trim),
    right: Math.max(0, padding.right - trim),
    bottom: rail == null ? 24 : canvas.margin + rail + 8,
    left: Math.max(0, padding.left - trim),
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
  const clear: Padding = {
    ...padding,
    left: e.left + m,
    right: windowWidth - e.right + m,
  };
  // A folded header on the left stays over the map; when it reaches the
  // controls' column they start below it.
  const controlsLeft = windowWidth - (clear.right - (m - canvas.margin)) - 44;
  const folded = placements.some(
    (p) => p.collapsed && p.side === "left" && p.x + p.width > controlsLeft - 8,
  );
  if (folded) clear.top = m + canvas.headerHeight + 8;
  const rectOf = (p: Padding): Rect => ({
    x: p.left,
    y: p.top,
    w: windowWidth - p.left - p.right,
    h: hostHeight - p.top - p.bottom,
  });
  const rect = rectOf(padding);
  if (rect.w < canvas.freeMin.w || rect.h < canvas.freeMin.h) {
    const whole = { top: m, left: m, right: m, bottom: m };
    return { rect: rectOf(whole), padding: whole, clear, fallback: true };
  }
  return { rect, padding, clear, fallback: false };
}
