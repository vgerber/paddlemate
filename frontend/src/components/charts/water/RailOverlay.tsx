import type { JSX } from "react";
import type { WaterRangeWithStatus } from "@/lib/api";
import { formatReading } from "@/lib/format";
import { theme } from "@/lib/theme";
import { pointTime } from "./chartTime";
import { clampLabelX, clampReadoutX, spreadWords } from "./railGeometry";
import { levelAt } from "./series";

const { tokens } = theme;

/** Height of the axis row under the rail's plot, in px. */
export const RAIL_AXIS = 20;

const DOT_R = 5;
const DOT_RING = 2.5;
const WORD_SIZE = 10.5;
const WORD_X = 12;
const READOUT_FLIP = 44;
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
  { key: "high", word: "High", from: "range_high" },
  { key: "medium", word: "Medium", from: "range_medium" },
  { key: "low", word: "Low", from: "range_low" },
] as const;

export interface RailPoint {
  time: number;
  value: number;
}

export interface RailOverlayProps {
  width: number;
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
  /** The curve comes down into the newest reading, so its value reads
   * better under the dot. */
  falling: boolean;
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
  height,
  top,
  domain,
  yDomain,
  thresholds,
  unit,
  latest,
  stale,
  falling,
  marker,
  hovering,
}: RailOverlayProps) {
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
  if (marker && hovering) {
    const mx = x(marker.time);
    const my = y(marker.value);
    const lv = level(marker.value);
    const value = formatReading(marker.value, unit);
    const time = pointTime(marker.time);
    const text = lv ? `${lv.word}, ${value}` : value;
    const half =
      Math.max(text.length * READOUT_CHAR, time.length * READOUT_TIME_CHAR) / 2;
    const cx = clampReadoutX(mx, half, width);
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
            <tspan fill={tokens.levels[lv.key].text}>{`${lv.word}, `}</tspan>
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
    const x1 = WORD_X + word.length * WORD_CHAR;
    return (
      x1 > readoutBox.x0 &&
      WORD_X < readoutBox.x1 &&
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
  const lbelow = ly - top < 24 || (falling && ly + 24 < plotBottom);
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
        overlaps(wordYs[i], l.word) ? null : (
          <g key={l.key}>
            <title>{`${l.word} from ${l.v} ${unit}`}</title>
            <text
              data-testid="threshold-label"
              x={WORD_X}
              y={wordYs[i]}
              fontSize={WORD_SIZE}
              fontWeight={600}
              fill={tokens.levels[l.key].text}
              {...halo}
            >
              {l.word}
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
      {latest && !hovering && (
        <text
          data-testid="latest-value"
          x={lx + DOT_R}
          y={lbelow ? ly + 21 : ly - 11}
          textAnchor="end"
          fontSize={13}
          fontWeight={600}
          fill={stale ? tokens.onSurfaceVariant : tokens.onSurface}
          {...halo}
        >
          {formatReading(latest.value, unit)}
        </text>
      )}
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

/** An axis label that keeps 12px clear of the plot's edges. */
export function RailTick({
  x,
  y,
  width,
  label,
}: RailTickProps & { width: number; label: string }) {
  const cx = clampLabelX(Number(x), label.length * TICK_CHAR, width);
  return (
    <text
      x={cx}
      y={Number(y) + 4}
      textAnchor="middle"
      fontSize={11}
      fill={tokens.onSurfaceVariant}
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {label}
    </text>
  );
}
