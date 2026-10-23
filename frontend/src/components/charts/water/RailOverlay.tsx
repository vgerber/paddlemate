import type { JSX } from "react";
import type { WaterRangeWithStatus } from "@/lib/api";
import { formatReading } from "@/lib/format";
import { theme } from "@/lib/theme";
import { levelInk, levelWord } from "@/lib/waterLevel";
import { pointTime } from "./chartTime";
import { clampLabelX, clampReadoutX, spreadWords } from "./railGeometry";
import { levelAt } from "./series";

const { tokens } = theme;

/** Height of the axis row under the rail's plot, in px. */
export const RAIL_AXIS = 20;

const DOT_R = 5;
const DOT_RING = 2.5;
const WORD_SIZE = 10.5;
const READOUT_FLIP = 44;
const READOUT_GAP = 8;
/** Estimated glyph widths: the readout's 13px text and the 10.5px words. */
const READOUT_CHAR = 7.2;
const READOUT_TIME_CHAR = 5.6;
const WORD_CHAR = 6.4;

const halo = {
  stroke: tokens.surface,
  strokeWidth: 3,
  paintOrder: "stroke",
  strokeLinejoin: "round",
} as const;

const LEVELS = [
  { key: "high", from: "range_high" },
  { key: "medium", from: "range_medium" },
  { key: "low", from: "range_low" },
] as const;

export interface RailPoint {
  time: number;
  value: number;
}

export interface RailOverlayProps {
  width: number;
  /** How far words keep from the plot's edges. On a phone the plot is the
   * card's full width, so the card's inner 16 puts them on the 28 lines. */
  edge: number;
  height: number;
  /** Room above the plot, in px. */
  top: number;
  /** The visible time window. */
  domain: [number, number];
  /** The y window the plot draws, or null without data. */
  yDomain: { lo: number; hi: number } | null;
  /** The ranges whose thresholds are named; absent when none are drawn. */
  thresholds?: WaterRangeWithStatus;
  unit: string;
  /** The newest reading, drawn as the ring dot. */
  latest: RailPoint | null;
  stale: boolean;
  /** The point the pointer picked; it stays marked until cleared. */
  marker: RailPoint | null;
  /** True while the pointer is over the plot: the readout shows. */
  hovering: boolean;
}

/** What the rail draws over its plot: threshold words on their lines, the
 * value at the line's right end, and the hovered or kept point with its
 * readout. The scales mirror the chart's own (full width, no y axis). */
export default function RailOverlay({
  width,
  edge,
  height,
  top,
  domain,
  yDomain,
  thresholds,
  unit,
  latest,
  stale,
  marker,
  hovering,
}: RailOverlayProps) {
  const wordX = edge;
  if (!yDomain) return null;
  const plotBottom = height - RAIL_AXIS;
  const span = domain[1] - domain[0] || 1;
  const x = (t: number) => ((t - domain[0]) / span) * width;
  const y = (v: number) =>
    top + ((yDomain.hi - v) / (yDomain.hi - yDomain.lo)) * (plotBottom - top);

  const lines = thresholds
    ? LEVELS.flatMap((l) => {
        const v = thresholds[l.from];
        return v == null ? [] : [{ ...l, v, y: y(v) }];
      })
    : [];
  const wordYs = spreadWords(lines.map((l) => l.y));

  const level = (v: number) =>
    thresholds
      ? LEVELS.find((l) => l.key === levelAt(v, thresholds))
      : undefined;

  let readout: JSX.Element | null = null;
  let readoutBox: { x0: number; x1: number; y0: number; y1: number } | null =
    null;
  if (marker) {
    const mx = x(marker.time);
    const my = y(marker.value);
    const lv = level(marker.value);
    const value = formatReading(marker.value, unit);
    const time = pointTime(marker.time);
    const text = lv ? `${levelWord(lv.key)}, ${value}` : value;
    const half =
      Math.max(text.length * READOUT_CHAR, time.length * READOUT_TIME_CHAR) / 2;
    // Beside the hairline, on the side with more room, not across it.
    const side = mx < width / 2 ? 1 : -1;
    const cx = clampReadoutX(mx + side * (half + READOUT_GAP), half, width);
    const below = my - top < READOUT_FLIP;
    const vy = below ? my + 22 : my - 25;
    const ty = below ? my + 36 : my - 11;
    readoutBox = { x0: cx - half, x1: cx + half, y0: vy - 13, y1: ty + 3 };
    readout = (
      <g data-testid="chart-readout" textAnchor="middle">
        <text
          x={cx}
          y={vy}
          fontSize={13}
          fontWeight={600}
          fill={tokens.onSurface}
          {...halo}
        >
          {lv && (
            <tspan fill={levelInk(lv.key)}>{`${levelWord(lv.key)}, `}</tspan>
          )}
          {value}
        </text>
        <text
          x={cx}
          y={ty}
          fontSize={11}
          fill={tokens.onSurfaceVariant}
          {...halo}
        >
          {time}
        </text>
      </g>
    );
  }

  const overlaps = (wy: number, word: string) => {
    if (!readoutBox) return false;
    const x1 = wordX + word.length * WORD_CHAR;
    return (
      x1 > readoutBox.x0 &&
      wordX < readoutBox.x1 &&
      wy > readoutBox.y0 &&
      wy - WORD_SIZE < readoutBox.y1
    );
  };

  const dot = (cx: number, cy: number, color: string, testid?: string) => (
    <circle
      data-testid={testid}
      cx={cx}
      cy={cy}
      r={DOT_R}
      fill={tokens.surface}
      stroke={color}
      strokeWidth={DOT_RING}
    />
  );

  const lx = latest ? x(latest.time) : 0;
  const ly = latest ? y(latest.value) : 0;
  const dotColor = stale ? tokens.outline : tokens.chartSeries;

  return (
    <svg
      aria-hidden
      width={width}
      height={height}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {lines.map((l, i) =>
        overlaps(wordYs[i], levelWord(l.key)) ? null : (
          <g key={l.key}>
            <title>{`${levelWord(l.key)} from ${l.v} ${unit}`}</title>
            <text
              data-testid="threshold-label"
              x={wordX}
              y={wordYs[i]}
              fontSize={WORD_SIZE}
              fontWeight={600}
              fill={levelInk(l.key)}
              {...halo}
            >
              {levelWord(l.key)}
            </text>
          </g>
        ),
      )}
      {marker && (
        <line
          data-testid="chart-marker-line"
          x1={x(marker.time)}
          x2={x(marker.time)}
          y1={top}
          y2={plotBottom}
          stroke={tokens.outline}
          strokeWidth={1}
          strokeDasharray={hovering ? undefined : "4 4"}
        />
      )}
      {latest && dot(lx, ly, dotColor, "latest-dot")}
      {marker &&
        dot(
          Math.max(x(marker.time), DOT_R + 2),
          y(marker.value),
          tokens.chartSeries,
        )}
      {readout}
    </svg>
  );
}

/** Estimated width of an 11px axis label per character, in px. */
const TICK_CHAR = 6.2;

export interface RailTickProps {
  x?: number | string;
  y?: number | string;
  payload?: { value?: unknown };
}

/** Where an axis label sits: kept clear of the plot's edges, and anchored on
 * the edge it is pushed against so its real glyph edge (not the width
 * estimate) lies on the line. */
function anchorFor(cx: number, w: number, width: number, edge: number) {
  if (cx - w / 2 <= edge) return { x: edge, anchor: "start" } as const;
  if (cx + w / 2 >= width - edge) {
    return { x: width - edge, anchor: "end" } as const;
  }
  return { x: cx, anchor: "middle" } as const;
}

/** An axis label that keeps clear of the plot's edges. */
export function RailTick({
  x,
  y,
  width,
  edge,
  label,
}: RailTickProps & { width: number; edge: number; label: string }) {
  const w = label.length * TICK_CHAR;
  const at = anchorFor(clampLabelX(Number(x), w, width, edge), w, width, edge);
  return (
    <text
      x={at.x}
      y={Number(y) + 4}
      textAnchor={at.anchor}
      fontSize={11}
      fill={tokens.onSurfaceVariant}
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {label}
    </text>
  );
}
