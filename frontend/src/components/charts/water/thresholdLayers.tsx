import type { JSX } from "react";
import { ReferenceArea, ReferenceLine } from "recharts";
import type { WaterRangeWithStatus } from "@/lib/api";
import type { ResolvedTokens } from "@/lib/useTokens";
import { levelInk } from "@/lib/waterLevel";

/** Radius of the latest reading's dot, and the gap the threshold labels keep
 * from it. The labels end this far short of the plot's right edge. */
export const DOT_RADIUS = 5;
const LABEL_GAP = DOT_RADIUS + 10;

/** Threshold reference lines for one range. The phone labels each under its
 * line and short of the latest reading's dot; the rail names them in its
 * overlay. Returned as an element array because recharts only recognizes
 * direct children. */
export function thresholdLines(
  r: WaterRangeWithStatus,
  rail: boolean,
  ink: ResolvedTokens,
) {
  const line = (key: string, y: number, color: string, labelText: string) => (
    <ReferenceLine
      key={`thresholds-${key}`}
      y={y}
      ifOverflow="hidden"
      stroke={color}
      strokeWidth={1.2}
      strokeDasharray="4 4"
      label={
        rail
          ? undefined
          : {
              content: ({ viewBox }) =>
                viewBox && "width" in viewBox ? (
                  <text
                    data-testid="threshold-label"
                    x={(viewBox.x ?? 0) + (viewBox.width ?? 0) - LABEL_GAP}
                    y={(viewBox.y ?? 0) + 13}
                    textAnchor="end"
                    fontSize={11}
                    fontWeight={600}
                    fill={color}
                  >
                    {labelText}
                  </text>
                ) : (
                  <g />
                ),
            }
      }
    />
  );
  return [
    r.range_low != null &&
      line("low", r.range_low, levelInk("low", ink), `L ${r.range_low}`),
    r.range_medium != null &&
      line(
        "medium",
        r.range_medium,
        levelInk("medium", ink),
        `M ${r.range_medium}`,
      ),
    r.range_high != null &&
      line("high", r.range_high, levelInk("high", ink), `H ${r.range_high}`),
  ].filter((l): l is JSX.Element => l !== false);
}

/** The quiet wash between thresholds: green from low to medium, amber from
 * medium to high. */
export function thresholdBands(r: WaterRangeWithStatus, ink: ResolvedTokens) {
  const band = (key: string, y1: number, y2: number, fill: string) => (
    <ReferenceArea
      key={key}
      y1={y1}
      y2={y2}
      ifOverflow="hidden"
      fill={fill}
      fillOpacity={0.06}
      stroke="none"
    />
  );
  return [
    r.range_low != null &&
      r.range_medium != null &&
      band("low", r.range_low, r.range_medium, ink.levels.low.text),
    r.range_medium != null &&
      r.range_high != null &&
      band("medium", r.range_medium, r.range_high, ink.levels.medium.text),
  ].filter((l): l is JSX.Element => l !== false);
}
